import { getLogContext } from './log-context';

export const REQUEST_ID_HEADER = 'x-request-id';
export const TRACE_ID_HEADER = 'x-trace-id';

/**
 * 현재 LogContext(ALS)의 requestId/traceId를 internal 서비스 간 HTTP 호출
 * 헤더로 그대로 넘기기 위한 헬퍼. game↔api internal 클라이언트가 이미 거쳐가는
 * 공통 헤더 빌더(internalRequestHeaders 등)에 스프레드해서 쓴다. traceId는
 * 없으면 채우지 않는다(§4 참고 — 임의 생성하지 않음).
 */
export function buildCorrelationHeaders(): Record<string, string> {
  const { requestId, traceId } = getLogContext();
  return {
    ...(requestId ? { [REQUEST_ID_HEADER]: requestId } : {}),
    ...(traceId ? { [TRACE_ID_HEADER]: traceId } : {}),
  };
}
