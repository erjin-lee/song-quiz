import { AsyncResource } from 'node:async_hooks';
import { CallHandler, ExecutionContext } from '@nestjs/common';
import {
  context as otelContext,
  trace,
  TraceFlags,
} from '@opentelemetry/api';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import { defer, firstValueFrom, Observable } from 'rxjs';
import { getLogContext } from './log-context';
import { SocketRequestContextInterceptor } from './socket-request-context.interceptor';

function mockExecutionContext(
  client: Record<string, unknown>,
  data: Record<string, unknown>,
): ExecutionContext {
  return {
    switchToWs: () => ({
      getClient: () => client,
      getData: () => data,
    }),
  } as unknown as ExecutionContext;
}

/**
 * @nestjs/core의 InterceptorsConsumer(interceptors-consumer.js)가 next.handle()을
 * 구현하는 핵심 메커니즘만 재현한다: handle: () => defer(AsyncResource.bind(실제
 * 핸들러 실행)). defer()는 subscribe 시점까지 실행을 미루므로, interceptor가
 * next.handle()을 호출하는 시점과 실제 핸들러가 실행되는 시점 사이에 시간차
 * (비동기 경계)가 생긴다 — AsyncResource.bind가 그 경계 너머로 AsyncLocalStorage
 * context를 들고 가는지가 이 테스트의 핵심이다(실제 Nest는 인터셉터 체인이
 * 여러 겹일 때 mergeAll()로 중첩 Observable을 풀어내지만, 그 부분은 이 검증과
 * 무관해 생략했다).
 */
function makeNestLikeCallHandler(
  actualHandler: () => Promise<unknown>,
): CallHandler {
  return {
    handle: () =>
      defer(AsyncResource.bind(actualHandler)) as Observable<unknown>,
  };
}

function wrapSpanContext(traceId: string, spanId: string) {
  return trace.wrapSpanContext({
    traceId,
    spanId,
    traceFlags: TraceFlags.SAMPLED,
  });
}

describe('SocketRequestContextInterceptor', () => {
  // 실제 앱에서는 tracing 패키지의 NodeSDK.start()가 이 ContextManager를 등록한다.
  const contextManager = new AsyncHooksContextManager();

  beforeAll(() => {
    contextManager.enable();
    otelContext.setGlobalContextManager(contextManager);
  });

  afterAll(() => {
    contextManager.disable();
  });

  it('OTel 활성 span이 없으면 x-trace-id 핸드셰이크 헤더가 있어도 traceId를 채우지 않는다', () => {
    const interceptor = new SocketRequestContextInterceptor();
    const client = { handshake: { headers: { 'x-trace-id': 'legacy-header' } }, data: {} };

    let contextSeenInsideHandler: ReturnType<typeof getLogContext> | undefined;
    const nestNext: CallHandler = {
      handle: () => {
        contextSeenInsideHandler = getLogContext();
        return defer(() => Promise.resolve('handled')) as Observable<unknown>;
      },
    };

    interceptor
      .intercept(mockExecutionContext(client, {}), nestNext)
      .subscribe();

    expect(contextSeenInsideHandler?.traceId).toBeUndefined();
  });

  it('@opentelemetry/instrumentation-socket.io가 메시지마다 새로 여는 receive span처럼, 이벤트마다 활성 span의 traceId를 그대로 읽는다(핸드셰이크 캐시 재사용 아님)', () => {
    const interceptor = new SocketRequestContextInterceptor();
    const client = { handshake: { headers: {} }, data: {} };

    const seenTraceIds: (string | undefined)[] = [];
    const handle = (): void => {
      const nestNext: CallHandler = {
        handle: () => {
          seenTraceIds.push(getLogContext().traceId);
          return defer(() => Promise.resolve('handled')) as Observable<unknown>;
        },
      };
      interceptor
        .intercept(mockExecutionContext(client, {}), nestNext)
        .subscribe();
    };

    // 같은 소켓(client)에서 이벤트 2개가 서로 다른 receive span(=다른 trace) 아래
    // 들어오는 상황을 흉내낸다 — 연결 시점 캐싱이 남아있다면 두 값이 같아야 한다.
    otelContext.with(
      trace.setSpan(otelContext.active(), wrapSpanContext(
        '0af7651916cd43dd8448eb211c80319c',
        'b7ad6b7169203331',
      )),
      handle,
    );
    otelContext.with(
      trace.setSpan(otelContext.active(), wrapSpanContext(
        '1bf7651916cd43dd8448eb211c80319d',
        'c8ad6b7169203331',
      )),
      handle,
    );

    expect(seenTraceIds).toEqual([
      '0af7651916cd43dd8448eb211c80319c',
      '1bf7651916cd43dd8448eb211c80319d',
    ]);
  });

  it('next.handle()의 Observable이 비동기 시점에 subscribe되어도(진짜 핸들러 실행 시점) requestId/roomId를 읽을 수 있다', async () => {
    const interceptor = new SocketRequestContextInterceptor();
    const client = { handshake: { headers: {} }, data: {} };
    const data = { roomId: 'room-1', userId: 'user-1' };

    let contextSeenInsideHandler: ReturnType<typeof getLogContext> | undefined;

    const nestNext = makeNestLikeCallHandler(() => {
      // 실제 @SubscribeMessage 핸들러가 여기서 실행된다고 가정한다.
      contextSeenInsideHandler = getLogContext();
      return Promise.resolve('handled');
    });

    const resultObservable = interceptor.intercept(
      mockExecutionContext(client, data),
      nestNext,
    );

    // subscribe를 다음 매크로태스크로 미뤄서, interceptor.intercept()가 이미
    // 반환하고 호출 스택이 완전히 빠져나온 뒤에야 실제 구독이 시작되게 한다.
    await new Promise((resolve) => setTimeout(resolve, 0));

    const result = await firstValueFrom(resultObservable);

    expect(result).toBe('handled');
    expect(contextSeenInsideHandler).toBeDefined();
    expect(contextSeenInsideHandler?.roomId).toBe('room-1');
    expect(contextSeenInsideHandler?.userId).toBe('user-1');
    expect(contextSeenInsideHandler?.requestId).toBeTruthy();
  });
});
