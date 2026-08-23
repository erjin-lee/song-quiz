import { randomUUID } from 'node:crypto';
import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { REQUEST_ID_HEADER, TRACE_ID_HEADER } from './correlation-headers';
import { LogContext, runWithLogContext } from './log-context';

function readHeader(req: Request, name: string): string | undefined {
  const value = req.headers[name];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

/**
 * 들어온 요청의 x-request-id를 우선 쓰고 없으면 생성해서, 응답 헤더로 echo하고
 * 이후 요청 처리 전체(AccessLogMiddleware 포함)를 이 값이 담긴 LogContext
 * 아래에서 실행한다. AppModule.configure()에서 다른 미들웨어보다 먼저
 * 등록해야 한다.
 *
 * traceId는 requestId와 달리 우리가 임의로 생성하지 않는다 — x-trace-id
 * 헤더로 들어온 경우에만 그대로 통과시킨다. 지금은 아무도 이 헤더를 보내지
 * 않지만, 나중에 OpenTelemetry(또는 다른 tracer)가 붙으면 그게 채우는 값을
 * 이 자리에서 그대로 읽기만 하면 되는 구조로 남겨둔다. 우리가 만든 임의의
 * 값을 traceId로 자처하면 실제 분산 트레이싱이 붙었을 때 진짜 trace id와
 * 구분이 안 된다.
 */
@Injectable()
export class HttpRequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const requestId = readHeader(req, REQUEST_ID_HEADER) ?? randomUUID();
    const traceId = readHeader(req, TRACE_ID_HEADER);

    res.setHeader(REQUEST_ID_HEADER, requestId);
    if (traceId) {
      res.setHeader(TRACE_ID_HEADER, traceId);
    }

    const context: Partial<LogContext> = {
      requestId,
      ...(traceId ? { traceId } : {}),
    };
    runWithLogContext(context, () => next());
  }
}
