import { randomBytes } from 'node:crypto';

const TEMP_PASSWORD_BYTE_LENGTH = 12;

export function generateTemporaryPassword(): string {
  return randomBytes(TEMP_PASSWORD_BYTE_LENGTH).toString('base64url');
}
