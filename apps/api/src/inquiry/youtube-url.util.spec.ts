import { parseYoutubeUrl } from './youtube-url.util';

describe('parseYoutubeUrl', () => {
  it('watch URL에서 videoId와 t 파라미터(초)를 추출한다', () => {
    expect(
      parseYoutubeUrl('https://www.youtube.com/watch?v=abc123&t=45'),
    ).toEqual({ videoId: 'abc123', startSec: 45 });
  });

  it('youtu.be 단축 URL에서 videoId를 추출한다', () => {
    expect(parseYoutubeUrl('https://youtu.be/abc123')).toEqual({
      videoId: 'abc123',
      startSec: null,
    });
  });

  it('t 파라미터의 s 접미사를 제거하고 파싱한다', () => {
    expect(parseYoutubeUrl('https://youtu.be/abc123?t=10s')).toEqual({
      videoId: 'abc123',
      startSec: 10,
    });
  });

  it('t 파라미터가 없으면 startSec은 null이다', () => {
    expect(parseYoutubeUrl('https://www.youtube.com/watch?v=abc123')).toEqual({
      videoId: 'abc123',
      startSec: null,
    });
  });

  it('URL 형식이 아니면 videoId/startSec 모두 null이다', () => {
    expect(parseYoutubeUrl('이건 URL이 아님')).toEqual({
      videoId: null,
      startSec: null,
    });
  });

  it('v 파라미터가 없는 유튜브 URL은 videoId가 null이다', () => {
    expect(
      parseYoutubeUrl('https://www.youtube.com/results?search_query=x'),
    ).toEqual({ videoId: null, startSec: null });
  });

  it('유튜브가 아닌 호스트는 v 파라미터가 있어도 videoId가 null이다', () => {
    expect(parseYoutubeUrl('https://example.com/?v=abc123')).toEqual({
      videoId: null,
      startSec: null,
    });
  });

  it('유튜브 호스트를 부분 문자열로만 포함하는 호스트는 거부한다', () => {
    expect(parseYoutubeUrl('https://youtu.be.evil.com/watch?v=abc123')).toEqual(
      { videoId: null, startSec: null },
    );
    expect(
      parseYoutubeUrl('https://evil-www.youtube.com/watch?v=abc123'),
    ).toEqual({ videoId: null, startSec: null });
  });

  it('https가 아니면 videoId가 null이다', () => {
    expect(parseYoutubeUrl('http://www.youtube.com/watch?v=abc123')).toEqual({
      videoId: null,
      startSec: null,
    });
  });
});
