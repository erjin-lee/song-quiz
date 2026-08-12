/**
 * 유튜브 링크의 t=(재생 시작 지점, 초 단위) 파라미터를 1초 앞당겨서 반환한다.
 * t= 파라미터가 없으면 원본을 그대로 반환한다.
 */
export function shiftYoutubeUrlStartSecEarlier(youtubeUrl: string): string {
  return youtubeUrl.replace(
    /([?&]t=)(\d+)/,
    (_match: string, prefix: string, secondsStr: string) => {
      const seconds = Number(secondsStr);
      return `${prefix}${Math.max(0, seconds - 1)}`;
    },
  );
}
