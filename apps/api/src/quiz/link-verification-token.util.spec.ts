import {
  issueLinkVerificationToken,
  verifyLinkVerificationToken,
} from './link-verification-token.util';

describe('link-verification-token.util', () => {
  const originalSecret = process.env.USER_JWT_SECRET;

  beforeEach(() => {
    process.env.USER_JWT_SECRET = 'test-secret';
  });

  afterAll(() => {
    process.env.USER_JWT_SECRET = originalSecret;
  });

  it('발급한 토큰을 같은 songId+videoId로 검증하면 서명된 source를 돌려준다', () => {
    const token = issueLinkVerificationToken('song-1', 'video-1', 'AUTO');

    const source = verifyLinkVerificationToken(token, 'song-1', 'video-1');

    expect(source).toBe('AUTO');
  });

  it('songId가 다르면 거부한다(다른 곡에 토큰을 붙여 재사용하는 시도)', () => {
    const token = issueLinkVerificationToken('song-1', 'video-1', 'AUTO');

    expect(verifyLinkVerificationToken(token, 'song-2', 'video-1')).toBeNull();
  });

  it('videoId가 다르면 거부한다(검증된 영상과 다른 영상을 등록하려는 시도)', () => {
    const token = issueLinkVerificationToken('song-1', 'video-1', 'AUTO');

    expect(verifyLinkVerificationToken(token, 'song-1', 'video-2')).toBeNull();
  });

  it('서명이 변조되면 거부한다', () => {
    const token = issueLinkVerificationToken('song-1', 'video-1', 'AUTO');
    const [payload] = token!.split('.');
    const tampered = `${payload}.deadbeef`;

    expect(
      verifyLinkVerificationToken(tampered, 'song-1', 'video-1'),
    ).toBeNull();
  });

  it('만료된 토큰은 거부한다', () => {
    jest.useFakeTimers().setSystemTime(new Date('2020-01-01T00:00:00Z'));
    const token = issueLinkVerificationToken('song-1', 'video-1', 'AUTO');
    jest.setSystemTime(new Date('2020-01-01T02:00:00Z'));

    expect(verifyLinkVerificationToken(token, 'song-1', 'video-1')).toBeNull();

    jest.useRealTimers();
  });

  it('토큰이 없으면 거부한다', () => {
    expect(
      verifyLinkVerificationToken(undefined, 'song-1', 'video-1'),
    ).toBeNull();
    expect(verifyLinkVerificationToken(null, 'song-1', 'video-1')).toBeNull();
  });

  it('시크릿이 설정되지 않으면 발급도 검증도 하지 않는다(secure by default)', () => {
    delete process.env.USER_JWT_SECRET;

    expect(issueLinkVerificationToken('song-1', 'video-1', 'AUTO')).toBeNull();
    expect(
      verifyLinkVerificationToken('anything.anything', 'song-1', 'video-1'),
    ).toBeNull();
  });
});
