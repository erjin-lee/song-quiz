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
