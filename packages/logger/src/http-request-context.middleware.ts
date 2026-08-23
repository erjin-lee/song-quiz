import { randomUUID } from 'node:crypto';
import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { runWithLogContext } from './log-context';

const REQUEST_ID_HEADER = 'x-request-id';
const TRACE_ID_HEADER = 'x-trace-id';

function readHeader(req: Request, name: string): string | undefined {
  const value = req.headers[name];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

/**
 * 들어온 요청의 x-request-id/x-trace-id를 우선 쓰고 없으면 생성해, 응답 헤더로
 * echo하고 이후 요청 처리 전체(AccessLogMiddleware 포함)를 이 값이 담긴
 * LogContext 아래에서 실행한다. AppModule.configure()에서 다른 미들웨어보다
 * 먼저 등록해야 한다.
 */
@Injectable()
export class HttpRequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const requestId = readHeader(req, REQUEST_ID_HEADER) ?? randomUUID();
    const traceId = readHeader(req, TRACE_ID_HEADER) ?? randomUUID();

    res.setHeader(REQUEST_ID_HEADER, requestId);
    res.setHeader(TRACE_ID_HEADER, traceId);

    runWithLogContext({ requestId, traceId }, () => next());
  }
}
