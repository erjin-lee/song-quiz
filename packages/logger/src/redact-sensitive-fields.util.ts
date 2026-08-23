const SENSITIVE_KEYS = new Set([
  'password',
  'pwd',
  'pwdhash',
  'code',
  'token',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'idtoken',
  'id_token',
  'apikey',
  'api_key',
  'clientsecret',
  'client_secret',
  'credential',
  'credentials',
  'secret',
  'authorization',
  'cookie',
]);

const REDACTED = '***';

/** 요청 body/query를 로그에 남기기 전에 비밀번호·인증코드·토큰류 값을 가린다. */
export function redactSensitiveFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactSensitiveFields);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, val]) => [
        key,
        SENSITIVE_KEYS.has(key.toLowerCase())
          ? REDACTED
          : redactSensitiveFields(val),
      ]),
    );
  }
  return value;
}
