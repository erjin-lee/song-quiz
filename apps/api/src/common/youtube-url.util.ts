const YOUTUBE_WATCH_HOSTNAMES = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
]);
const YOUTUBE_SHORT_HOSTNAME = 'youtu.be';

export interface ParsedYoutubeUrl {
  videoId: string | null;
  /** t 파라미터에서 읽은 시작 시간(초). 파라미터가 없거나 파싱할 수 없으면 null. */
  startSec: number | null;
}

function parseTimeParam(raw: string): number | null {
  const value = Number(raw.replace(/s$/i, ''));
  // 음수는 0으로 보정한다 - 여기서 보정하지 않으면 이 값을 쓰는 곳마다(정규화된
  // URL, DB의 startSec/endSec) 따로 보정해야 해서 서로 다른 값으로 어긋나기 쉽다.
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
}

/**
 * https + 알려진 유튜브 호스트·경로만 유튜브 영상 URL로 인정한다:
 * - youtube.com 계열은 반드시 /watch 경로여야 한다(예: /results?v=x, /?v=x 같은
 *   비영상 경로는 v 파라미터가 있어도 거부 - 검색 결과/홈 페이지를 영상으로
 *   오인하면 이후 스크래핑·재생 대상이 실제 저장되는 URL과 달라진다).
 * - youtu.be는 첫 path segment 하나만 videoId로 인정한다(추가 경로 조각은 무시하지
 *   않고 파싱 자체를 실패시킨다).
 * - hostname은 정확히 일치해야 한다("youtu.be.evil.com" 같은 부분 문자열 일치를
 *   막는다).
 */
export function parseYoutubeUrl(rawUrl: string): ParsedYoutubeUrl {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { videoId: null, startSec: null };
  }

  if (url.protocol !== 'https:') {
    return { videoId: null, startSec: null };
  }

  let videoId: string | null;
  if (url.hostname === YOUTUBE_SHORT_HOSTNAME) {
    const segments = url.pathname.split('/').filter(Boolean);
    videoId = segments.length === 1 ? segments[0] : null;
  } else if (
    YOUTUBE_WATCH_HOSTNAMES.has(url.hostname) &&
    url.pathname === '/watch'
  ) {
    videoId = url.searchParams.get('v');
  } else {
    videoId = null;
  }

  const tParam = url.searchParams.get('t');
  const startSec = tParam !== null ? parseTimeParam(tParam) : null;

  return { videoId, startSec };
}

/**
 * 검증된 videoId(+ 선택적 startSec)로 정규화한 유튜브 watch URL을 만든다. 사용자가
 * 제출한 원본 URL을 그대로 저장하지 않고 이 함수로 정규화해서 저장해야, 스크래핑/
 * 재생에 실제로 쓰이는 URL과 DB에 저장되는 URL이 항상 일치한다.
 */
export function buildYoutubeWatchUrl(
  videoId: string,
  startSec?: number | null,
): string {
  const url = new URL('https://www.youtube.com/watch');
  url.searchParams.set('v', videoId);
  if (startSec !== null && startSec !== undefined) {
    url.searchParams.set('t', String(Math.max(0, Math.round(startSec))));
  }
  return url.toString();
}
