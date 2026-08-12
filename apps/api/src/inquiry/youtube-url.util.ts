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

/** 기존 링크의 t 파라미터만 새 시작 시간으로 교체한다. URL 형식이 아니면 원본을 그대로 반환한다. */
export function withStartSecParam(rawUrl: string, startSec: number): string {
  try {
    const url = new URL(rawUrl);
    url.searchParams.set('t', String(startSec));
    return url.toString();
  } catch {
    return rawUrl;
  }
}
