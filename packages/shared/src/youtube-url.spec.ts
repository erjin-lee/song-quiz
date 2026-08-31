import { withStartSecParam } from './youtube-url';

describe('withStartSecParam', () => {
  it('URL에 t 파라미터가 없으면 새로 추가한다', () => {
    expect(withStartSecParam('https://youtu.be/abc123', 35)).toBe(
      'https://youtu.be/abc123?t=35',
    );
  });

  it('URL에 t 파라미터가 이미 있으면 새 값으로 교체한다', () => {
    expect(withStartSecParam('https://youtu.be/abc123?t=10&foo=bar', 52)).toBe(
      'https://youtu.be/abc123?t=52&foo=bar',
    );
  });

  it('음수는 0으로, 소수점은 반올림해서 넣는다', () => {
    expect(withStartSecParam('https://youtu.be/abc123', -5)).toBe(
      'https://youtu.be/abc123?t=0',
    );
    expect(withStartSecParam('https://youtu.be/abc123', 35.6)).toBe(
      'https://youtu.be/abc123?t=36',
    );
  });

  it('URL 형식이 아니면 원본을 그대로 반환한다', () => {
    expect(withStartSecParam('not-a-url', 35)).toBe('not-a-url');
  });
});
