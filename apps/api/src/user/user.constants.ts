export const BCRYPT_SALT_ROUNDS = 10;
export const USER_JWT_EXPIRES_IN = '30d';
/** 세션 쿠키 maxAge(ms). USER_JWT_EXPIRES_IN과 같은 기간을 나타내며, 둘 중 하나를
 * 바꾸면 다른 쪽도 함께 맞춘다. */
export const AUTH_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const USER_ROLE = 'USER';
