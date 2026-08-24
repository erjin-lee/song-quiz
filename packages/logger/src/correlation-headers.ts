import { getLogContext } from './log-context';

export const REQUEST_ID_HEADER = 'x-request-id';
export const TRACE_ID_HEADER = 'x-trace-id';

/**
 * 현재 LogContext(ALS)의 requestId를 internal 서비스 간 HTTP 호출 헤더로 그대로
 * 넘기기 위한 헬퍼. game↔api internal 클라이언트가 이미 거쳐가는 공통 헤더
 * 빌더(internalRequestHeaders 등)에 스프레드해서 쓴다.
 *
 * traceId는 여기서 넘기지 않는다 — game/api의 internal 호출은 전부 전역
 * fetch(undici)를 쓰고, OTel auto instrumentation(instrumentation-undici)이
 * 이미 W3C `traceparent` 헤더로 활성 span의 traceId를 자동 전파한다. 수신 쪽
 * (HttpRequestContextMiddleware)도 요청 헤더가 아니라 OTel 활성 span에서만
 * traceId를 읽으므로, 여기서 x-trace-id로 다시 실어 보내는 값은 아무도 읽지
 * 않는 죽은 헤더였다.
 */
export function buildCorrelationHeaders(): Record<string, string> {
  const { requestId } = getLogContext();
  return {
    ...(requestId ? { [REQUEST_ID_HEADER]: requestId } : {}),
  };
}
