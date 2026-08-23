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

  it('x-trace-id 헤더가 없으면 traceId를 임의로 생성하지 않는다', () => {
    const req = mockRequest();
    const res = mockResponse();
    let contextSeenInNext: ReturnType<typeof getLogContext> | undefined;

    middleware.use(req, res, () => {
      contextSeenInNext = getLogContext();
    });

    expect(res.headers['x-trace-id']).toBeUndefined();
    expect(contextSeenInNext?.traceId).toBeUndefined();
  });

  it('x-trace-id 헤더가 있으면 그대로 통과시켜 응답 헤더로도 echo한다', () => {
    const req = mockRequest({ 'x-trace-id': 'incoming-trace-id' });
    const res = mockResponse();
    let contextSeenInNext: ReturnType<typeof getLogContext> | undefined;

    middleware.use(req, res, () => {
      contextSeenInNext = getLogContext();
    });

    expect(res.headers['x-trace-id']).toBe('incoming-trace-id');
    expect(contextSeenInNext?.traceId).toBe('incoming-trace-id');
  });

  it('미들웨어 바깥에서는 context가 비어있다', () => {
    expect(getLogContext()).toEqual({});
  });
});
