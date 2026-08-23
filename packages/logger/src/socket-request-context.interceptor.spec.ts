import { AsyncResource } from 'node:async_hooks';
import { CallHandler, ExecutionContext } from '@nestjs/common';
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

describe('SocketRequestContextInterceptor', () => {
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
