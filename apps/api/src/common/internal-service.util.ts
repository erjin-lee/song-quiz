/** 헤더명은 apps/game 쪽 InternalAuthGuard와 반드시 동일해야 한다. */
export const INTERNAL_SECRET_HEADER = 'x-internal-secret';

/**
 * apps/game의 내부 전용 엔드포인트를 호출하기 위한 공통 헤더. INTERNAL_SERVICE_SECRET이
 * 설정돼 있지 않으면 apps/game의 InternalAuthGuard가 항상 거부하므로, 여기서도 미설정을
 * 조용히 넘기지 않고 바로 에러를 던져 원인을 명확히 한다.
 */
export function internalRequestHeaders(): Record<string, string> {
  const secret = process.env.INTERNAL_SERVICE_SECRET;
  if (!secret) {
    throw new Error('INTERNAL_SERVICE_SECRET이 설정되지 않았습니다.');
  }
  return {
    'Content-Type': 'application/json',
    [INTERNAL_SECRET_HEADER]: secret,
  };
}
