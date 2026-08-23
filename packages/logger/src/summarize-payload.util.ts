import { redactSensitiveFields } from './redact-sensitive-fields.util';

const DEFAULT_MAX_BYTES = 2048;

/**
 * 요청 body/query를 로그에 남기기 전에 민감 필드를 가리고, 그래도 너무 크면
 * 값 대신 크기/키 목록만 남긴 요약으로 바꾼다. redaction만 믿고 payload
 * 전체를 무조건 기록하지 않기 위한 안전장치 — 큰 payload가 로그(및 로그
 * 저장 비용)를 불필요하게 부풀리는 것을 막는다.
 */
export function summarizeForLog(
  value: unknown,
  maxBytes: number = DEFAULT_MAX_BYTES,
): unknown {
  if (value === undefined || value === null) {
    return value;
  }

  const redacted = redactSensitiveFields(value);
  const serialized = JSON.stringify(redacted);
  if (serialized === undefined) {
    return redacted;
  }

  const byteLength = Buffer.byteLength(serialized, 'utf8');
  if (byteLength <= maxBytes) {
    return redacted;
  }

  const keys =
    redacted && typeof redacted === 'object' && !Array.isArray(redacted)
      ? Object.keys(redacted as Record<string, unknown>)
      : undefined;

  return { truncated: true, byteLength, ...(keys ? { keys } : {}) };
}
