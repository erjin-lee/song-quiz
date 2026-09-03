import { createHmac, timingSafeEqual } from 'crypto';

export type LinkVerificationSource = 'MANUAL' | 'AUTO';

interface LinkVerificationPayload {
  purpose: 'quiz-link-verification';
  songId: string;
  videoId: string;
  source: LinkVerificationSource;
  exp: number;
}

/** 퀴즈 빌더에서 곡 하나를 편집하는 데 걸릴 만한 시간. */
const TOKEN_TTL_MS = 60 * 60 * 1000;

function sign(payloadB64: string, secret: string): string {
  return createHmac('sha256', secret).update(payloadB64).digest('hex');
}

/**
 * 즉시 검증/자동 검색이 "이 songId+videoId+source 조합은 서버가 이미
 * 확인했다"는 사실을 클라이언트가 위조할 수 없게 서명해 돌려준다. 최종 등록
 * 시 이 토큰으로 안전망 검증 규칙(AUTO 출처는 제목 매칭 생략, spec.md 3.3-③)을
 * 결정한다 - 클라이언트가 보내는 source 문자열 자체를 신뢰하던 예전 방식은
 * 그 값 자체를 조작해 검증을 우회할 수 있어 대체했다(코드 리뷰 지적).
 *
 * USER_JWT_SECRET을 재사용한다 - 로그인 JWT와 페이로드 구조가 겹치지 않도록
 * purpose 필드로 구분하고, 새 시크릿을 운영에 추가로 배포해야 하는 부담을 없앤다.
 */
export function issueLinkVerificationToken(
  songId: string,
  videoId: string,
  source: LinkVerificationSource,
): string | null {
  const secret = process.env.USER_JWT_SECRET;
  if (!secret) {
    return null;
  }

  const payload: LinkVerificationPayload = {
    purpose: 'quiz-link-verification',
    songId,
    videoId,
    source,
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${payloadB64}.${sign(payloadB64, secret)}`;
}

/**
 * 토큰이 이 songId+videoId 조합에 대해 서버가 발급한 것인지 확인한다.
 * songId나 videoId가 다르면(예: A곡 검증 토큰을 다른 videoId에 붙여 보내는
 * 시도) 실패로 처리한다. 실패 시 null을 반환하며, 호출자는 이를 "검증된
 * 예외 없음(= 항상 콘텐츠 검증)"으로 다뤄야 한다(secure by default).
 */
export function verifyLinkVerificationToken(
  token: string | null | undefined,
  songId: string,
  videoId: string,
): LinkVerificationSource | null {
  const secret = process.env.USER_JWT_SECRET;
  if (!secret || !token) {
    return null;
  }

  const [payloadB64, signature] = token.split('.');
  if (!payloadB64 || !signature) {
    return null;
  }

  const expectedSignature = sign(payloadB64, secret);
  const expected = Buffer.from(expectedSignature, 'utf8');
  const actual = Buffer.from(signature, 'utf8');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }

  let payload: LinkVerificationPayload;
  try {
    payload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8'),
    ) as LinkVerificationPayload;
  } catch {
    return null;
  }

  if (
    payload.purpose !== 'quiz-link-verification' ||
    payload.songId !== songId ||
    payload.videoId !== videoId ||
    payload.exp < Date.now()
  ) {
    return null;
  }

  return payload.source;
}
