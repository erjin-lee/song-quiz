import { redactSensitiveFields } from './redact-sensitive-fields.util';

describe('redactSensitiveFields', () => {
  it.each([
    'password',
    'pwd',
    'pwdhash',
    'code',
    'token',
    'accessToken',
    'access_token',
    'refreshToken',
    'refresh_token',
    'idToken',
    'id_token',
    'apiKey',
    'api_key',
    'clientSecret',
    'client_secret',
    'credential',
    'credentials',
    'secret',
    'authorization',
    'cookie',
    'COOKIE',
    'Authorization',
  ])('%s 필드는 대소문자와 무관하게 마스킹된다', (key) => {
    const result = redactSensitiveFields({
      [key]: 'sensitive-value',
    }) as Record<string, unknown>;
    expect(result[key]).toBe('***');
  });

  it('중첩된 객체/배열 안의 민감 필드도 재귀적으로 마스킹한다', () => {
    const result = redactSensitiveFields({
      user: { nickname: 'iu', password: 'secret1234' },
      tokens: [{ accessToken: 'a' }, { refreshToken: 'b' }],
    }) as Record<string, unknown>;

    expect((result.user as Record<string, unknown>).password).toBe('***');
    expect((result.user as Record<string, unknown>).nickname).toBe('iu');
    const tokens = result.tokens as Record<string, unknown>[];
    expect(tokens[0].accessToken).toBe('***');
    expect(tokens[1].refreshToken).toBe('***');
  });

  it('민감하지 않은 필드는 그대로 유지한다', () => {
    const result = redactSensitiveFields({ nickname: 'iu', roomId: 'room-1' });
    expect(result).toEqual({ nickname: 'iu', roomId: 'room-1' });
  });
});
