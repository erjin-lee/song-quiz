import { context as otelContext, trace, TraceFlags } from '@opentelemetry/api';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import { Request, Response } from 'express';
import { getLogContext } from './log-context';
import { HttpRequestContextMiddleware } from './http-request-context.middleware';

function mockRequest(headers: Record<string, string> = {}): Request {
  return { headers } as unknown as Request;
}

function mockResponse(): Response & { headers: Record<string, string> } {
  const headers: Record<string, string> = {};
  return {
    headers,
    setHeader: (name: string, value: string) => {
      headers[name] = value;
    },
  } as unknown as Response & { headers: Record<string, string> };
}

describe('HttpRequestContextMiddleware', () => {
  const middleware = new HttpRequestContextMiddleware();

  // 실제 앱에서는 tracing 패키지의 NodeSDK.start()가 이 ContextManager를 등록한다.
  // @opentelemetry/api 단독으로는 no-op manager라 context.with()가 아무 효과가
  // 없으므로, "OTel 활성 span 우선" 테스트를 위해 여기서 직접 등록해 흉내낸다.
  const contextManager = new AsyncHooksContextManager();

  beforeAll(() => {
    contextManager.enable();
    otelContext.setGlobalContextManager(contextManager);
  });

  afterAll(() => {
    contextManager.disable();
  });

  it('요청에 x-request-id가 없으면 새로 생성해서 응답 헤더로 echo한다', () => {
    const req = mockRequest();
    const res = mockResponse();
    let contextSeenInNext: ReturnType<typeof getLogContext> | undefined;

    middleware.use(req, res, () => {
      contextSeenInNext = getLogContext();
    });

    expect(res.headers['x-request-id']).toBeTruthy();
    expect(contextSeenInNext?.requestId).toBe(res.headers['x-request-id']);
  });

  it('요청에 x-request-id가 있으면 그대로 사용한다', () => {
    const req = mockRequest({ 'x-request-id': 'incoming-request-id' });
    const res = mockResponse();
    let contextSeenInNext: ReturnType<typeof getLogContext> | undefined;

    middleware.use(req, res, () => {
      contextSeenInNext = getLogContext();
    });

    expect(res.headers['x-request-id']).toBe('incoming-request-id');
    expect(contextSeenInNext?.requestId).toBe('incoming-request-id');
  });

  it('OTel 활성 span이 없으면 traceId를 임의로 생성하지도, x-trace-id 헤더로 채우지도 않는다', () => {
    const req = mockRequest({ 'x-trace-id': 'incoming-trace-id' });
    const res = mockResponse();
    let contextSeenInNext: ReturnType<typeof getLogContext> | undefined;

    middleware.use(req, res, () => {
      contextSeenInNext = getLogContext();
    });

    expect(res.headers['x-trace-id']).toBeUndefined();
    expect(contextSeenInNext?.traceId).toBeUndefined();
  });

  it('미들웨어 바깥에서는 context가 비어있다', () => {
    expect(getLogContext()).toEqual({});
  });

  it('OTel 활성 span이 있으면 그 span의 traceId를 사용한다(x-trace-id 헤더는 무시)', () => {
    const req = mockRequest({ 'x-trace-id': 'incoming-trace-id' });
    const res = mockResponse();
    let contextSeenInNext: ReturnType<typeof getLogContext> | undefined;

    const span = trace.wrapSpanContext({
      traceId: '0af7651916cd43dd8448eb211c80319c',
      spanId: 'b7ad6b7169203331',
      traceFlags: TraceFlags.SAMPLED,
    });
    const activeContext = trace.setSpan(otelContext.active(), span);

    otelContext.with(activeContext, () => {
      middleware.use(req, res, () => {
        contextSeenInNext = getLogContext();
      });
    });

    expect(contextSeenInNext?.traceId).toBe('0af7651916cd43dd8448eb211c80319c');
    expect(res.headers['x-trace-id']).toBe('0af7651916cd43dd8448eb211c80319c');
  });
});
