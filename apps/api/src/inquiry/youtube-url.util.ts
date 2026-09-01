const YOUTUBE_HOSTNAMES = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
]);

export interface ParsedYoutubeUrl {
  videoId: string | null;
  /** t 파라미터에서 읽은 시작 시간(초). 파라미터가 없거나 파싱할 수 없으면 null. */
  startSec: number | null;
}

function parseTimeParam(raw: string): number | null {
  const value = Number(raw.replace(/s$/i, ''));
  return Number.isFinite(value) ? Math.round(value) : null;
}

/**
 * https + 알려진 유튜브 호스트만 유튜브 URL로 인정한다(hostname 정확히 일치 - 예:
 * "youtu.be.evil.com" 같은 부분 문자열 일치를 막는다). videoId를 실제로 사용하는
 * 모든 곳(재생시간 스크래핑, DB 저장 등)이 엉뚱한 호스트의 쿼리 파라미터를 유튜브
 * videoId로 오인하지 않도록 하기 위함이다.
 */
export function parseYoutubeUrl(rawUrl: string): ParsedYoutubeUrl {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { videoId: null, startSec: null };
  }

  if (url.protocol !== 'https:' || !YOUTUBE_HOSTNAMES.has(url.hostname)) {
    return { videoId: null, startSec: null };
  }

  const videoId =
    url.hostname === 'youtu.be'
      ? url.pathname.slice(1) || null
      : url.searchParams.get('v');

  const tParam = url.searchParams.get('t');
  const startSec = tParam !== null ? parseTimeParam(tParam) : null;

  return { videoId, startSec };
}
