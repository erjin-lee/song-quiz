export interface ParsedYoutubeUrl {
  videoId: string | null;
  /** t 파라미터에서 읽은 시작 시간(초). 파라미터가 없거나 파싱할 수 없으면 null. */
  startSec: number | null;
}

function parseTimeParam(raw: string): number | null {
  const value = Number(raw.replace(/s$/i, ''));
  return Number.isFinite(value) ? Math.round(value) : null;
}

export function parseYoutubeUrl(rawUrl: string): ParsedYoutubeUrl {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { videoId: null, startSec: null };
  }

  const videoId = url.hostname.includes('youtu.be')
    ? url.pathname.slice(1) || null
    : url.searchParams.get('v');

  const tParam = url.searchParams.get('t');
  const startSec = tParam !== null ? parseTimeParam(tParam) : null;

  return { videoId, startSec };
}
