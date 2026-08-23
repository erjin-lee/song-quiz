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

  // apps/api/src/admin/dto/change-admin-password-request.dto.ts의 실제 필드.
  // exact-match 방식이었을 때는 password/pwd 목록에 없어 평문 그대로 로그에
  // 남았다 — 이 테스트가 그 회귀를 잡는다.
  it.each([
    'currentPassword',
    'newPassword',
    'confirmPassword',
    'temporaryPassword',
  ])(
    '%s처럼 password가 포함된 필드명도 마스킹한다(정확히 일치하지 않아도)',
    (key) => {
      const result = redactSensitiveFields({
        [key]: 'plain-text-secret',
      }) as Record<string, unknown>;
      expect(result[key]).toBe('***');
    },
  );

  it.each(['statusCode', 'errorCode', 'quizId', 'roomId', 'nickname'])(
    '%s처럼 민감 단어를 포함하지 않는 필드는 마스킹하지 않는다(오탐 방지)',
    (key) => {
      const result = redactSensitiveFields({ [key]: 'value' }) as Record<
        string,
        unknown
      >;
      expect(result[key]).toBe('value');
    },
  );

  it('tokens처럼 민감 단어를 부분 포함하는 컬렉션 필드명은 통째로 마스킹하지 않고 재귀적으로 내려간다', () => {
    const result = redactSensitiveFields({
      tokens: [{ accessToken: 'a', label: 'primary' }],
    }) as Record<string, unknown>;

    const tokens = result.tokens as Record<string, unknown>[];
    expect(Array.isArray(tokens)).toBe(true);
    expect(tokens[0].accessToken).toBe('***');
    expect(tokens[0].label).toBe('primary');
  });
});
