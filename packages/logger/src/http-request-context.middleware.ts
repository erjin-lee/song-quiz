import { randomUUID } from 'node:crypto';
import { Injectable, NestMiddleware } from '@nestjs/common';
import { trace } from '@opentelemetry/api';
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
 * traceId는 requestId와 달리 우리가 임의로 생성하지 않는다. OpenTelemetry
 * 자동 계측(@opentelemetry/instrumentation-http)이 이 미들웨어보다 먼저
 * 요청마다 span을 열어두므로, 그 활성 span의 실제 traceId만 사용한다 — 이게
 * 예전부터 여기 남겨뒀던 "나중에 tracer가 붙으면 그대로 읽기만 하면 되는
 * 자리"다. x-trace-id 헤더로의 폴백은 OTel이 실제로 붙기 전까지의 임시
 * 조치였으므로 제거했다 — 활성 span이 없으면(SDK 미기동, tracing 비활성화
 * 등) traceId도 없다. 우리가 만든 임의의 값을 traceId로 자처하지 않는다 —
 * 실제 분산 트레이싱과 구분이 안 되기 때문이다.
 */
@Injectable()
export class HttpRequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const requestId = readHeader(req, REQUEST_ID_HEADER) ?? randomUUID();
    const traceId = trace.getActiveSpan()?.spanContext().traceId;

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
