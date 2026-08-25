/** apps/api와 동일한 목적의 파일이지만 별도 프로세스라 그대로 복제한다(다른
 * common 유틸과 같은 이유 — game CLAUDE.md 참고). apps/web/apps/api와 공유하는
 * 로그인 세션 쿠키 이름이므로 이름을 바꾸면 apps/api 쪽도 함께 바꿔야 한다. */
export const AUTH_COOKIE_NAME = 'sq_session';

/**
 * `Cookie` 요청 헤더에서 특정 이름의 값만 꺼낸다. 쿠키 파싱을 위해 별도 패키지를
 * 추가하지 않고, 여기서 필요한 최소한(단일 이름 조회)만 직접 구현한다.
 */
export function parseCookie(
  cookieHeader: string | undefined,
  name: string,
): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }
  for (const part of cookieHeader.split(';')) {
    const separatorIndex = part.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }
    const key = part.slice(0, separatorIndex).trim();
    if (key === name) {
      return decodeURIComponent(part.slice(separatorIndex + 1).trim());
    }
  }
  return undefined;
}
