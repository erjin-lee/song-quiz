import { format } from 'winston';

export const TIMESTAMP_FORMAT = 'YYYY-MM-DD HH:mm:ss.SSS';

/**
 * environment === 'production'이면 stdout이 CloudWatch 등에서 필드 기반으로
 * 검색 가능하도록 JSON 한 줄로, 그 외(로컬 개발)에는 사람이 읽기 좋은 포맷으로
 * 콘솔 로그를 남긴다. "무엇을 어떻게 보여줄지"(pretty print)는 로그 종류마다
 * 다를 수 있어(access log는 HTTP 한 줄 요약, app log는 범용 key=value) 호출부가
 * prettyPrint 함수를 넘긴다 — StructuredLogger와 양쪽 앱의 access-logger.factory.ts가
 * 이 함수를 공유해서 dev/prod 분기 로직이 중복되지 않게 한다.
 */
export function createConsoleFormat(
  environment: string,
  prettyPrint: (info: Record<string, unknown>) => string,
) {
  return format.combine(
    format.timestamp({ format: TIMESTAMP_FORMAT }),
    environment === 'production' ? format.json() : format.printf(prettyPrint),
  );
}
