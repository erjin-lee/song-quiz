/**
 * 정규화(소문자 + `_`/`-` 제거) 후 정확히 일치하는 필드명만 마스킹한다.
 * substring 매칭은 시도해봤지만 `tokens`(배열 필드명) 같은 무해한 키가
 * "token"을 포함한다는 이유로 통째로(재귀 내려가지 못하고) 마스킹되는
 * 오탐이 있어 되돌렸다 — 대신 실제 DTO에 존재하는 변형(currentPassword,
 * newPassword 등)을 명시적으로 채워 넣는다. 새 민감 필드가 추가되면 이
 * 목록도 함께 갱신해야 한다.
 */
const SENSITIVE_KEYS = new Set([
  'password',
  'pwd',
  'passwd',
  'pwdhash',
  'currentpassword',
  'newpassword',
  'oldpassword',
  'confirmpassword',
  'temporarypassword',
  'code',
  'token',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'apikey',
  'clientsecret',
  'secret',
  'credential',
  'credentials',
  'authorization',
  'cookie',
]);

const REDACTED = '***';

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, '');
}

/** 요청 body/query를 로그에 남기기 전에 비밀번호·인증코드·토큰류 값을 가린다. */
export function redactSensitiveFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactSensitiveFields);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, val]) => [
        key,
        SENSITIVE_KEYS.has(normalizeKey(key))
          ? REDACTED
          : redactSensitiveFields(val),
      ]),
    );
  }
  return value;
}
