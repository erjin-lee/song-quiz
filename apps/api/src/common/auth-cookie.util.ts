import { CookieOptions } from 'express';

/** apps/web/apps/game과 공유하는 로그인 세션 쿠키 이름. 콜론은 쿠키 이름에 쓸 수 없어
 * 기존 localStorage 키(`song-quiz:token`)와는 다른 이름을 쓴다. */
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

/**
 * 로그인 세션 쿠키의 공통 옵션. Set-Cookie/clearCookie 양쪽에서 동일하게 써야
 * 브라우저가 같은 쿠키로 인식한다(특히 clearCookie는 domain/path가 셋 당시와
 * 일치해야 실제로 지워진다).
 *
 * `COOKIE_DOMAIN`(예: `.noraemat.site`)이 없으면 host-only 쿠키가 되어, 로컬
 * 개발처럼 web/api/game이 전부 `localhost`인 환경에서도(포트만 다름) 그대로
 * 동작한다. web(apex)/api/game이 같은 상위 도메인 아래 있어야 프로덕션에서
 * 서비스 간 쿠키가 공유된다 — 배포 환경변수로 채운다.
 */
export function authCookieOptions(maxAge?: number): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    domain: process.env.COOKIE_DOMAIN || undefined,
    ...(maxAge !== undefined ? { maxAge } : {}),
  };
}
