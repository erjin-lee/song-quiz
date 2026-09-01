import { buildYoutubeWatchUrl, parseYoutubeUrl } from './youtube-url.util';

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

  it('t 파라미터가 음수면 0으로 보정한다', () => {
    expect(parseYoutubeUrl('https://youtu.be/abc123?t=-60')).toEqual({
      videoId: 'abc123',
      startSec: 0,
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

  it('유튜브 호스트라도 /watch 경로가 아니면 v 파라미터가 있어도 videoId가 null이다', () => {
    expect(parseYoutubeUrl('https://www.youtube.com/results?v=abc123')).toEqual(
      { videoId: null, startSec: null },
    );
    expect(parseYoutubeUrl('https://www.youtube.com/?v=abc123')).toEqual({
      videoId: null,
      startSec: null,
    });
  });

  it('youtu.be는 path segment가 하나가 아니면(추가 경로가 붙으면) videoId가 null이다', () => {
    expect(parseYoutubeUrl('https://youtu.be/abc123/extra')).toEqual({
      videoId: null,
      startSec: null,
    });
    expect(parseYoutubeUrl('https://youtu.be/')).toEqual({
      videoId: null,
      startSec: null,
    });
  });
});

describe('buildYoutubeWatchUrl', () => {
  it('videoId만으로 정규화된 watch URL을 만든다', () => {
    expect(buildYoutubeWatchUrl('abc123')).toBe(
      'https://www.youtube.com/watch?v=abc123',
    );
  });

  it('startSec이 있으면 t 파라미터를 붙인다', () => {
    expect(buildYoutubeWatchUrl('abc123', 45)).toBe(
      'https://www.youtube.com/watch?v=abc123&t=45',
    );
  });

  it('startSec이 null/undefined면 t 파라미터를 붙이지 않는다', () => {
    expect(buildYoutubeWatchUrl('abc123', null)).toBe(
      'https://www.youtube.com/watch?v=abc123',
    );
    expect(buildYoutubeWatchUrl('abc123')).toBe(
      'https://www.youtube.com/watch?v=abc123',
    );
  });

  it('startSec이 음수로 들어와도(방어적으로) 0으로 보정한다', () => {
    expect(buildYoutubeWatchUrl('abc123', -60)).toBe(
      'https://www.youtube.com/watch?v=abc123&t=0',
    );
  });
});
