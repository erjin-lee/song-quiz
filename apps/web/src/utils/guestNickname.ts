const SUFFIX_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
const SUFFIX_LENGTH = 5;

export function generateGuestNickname(): string {
  let suffix = '';
  for (let i = 0; i < SUFFIX_LENGTH; i += 1) {
    suffix += SUFFIX_CHARS[Math.floor(Math.random() * SUFFIX_CHARS.length)];
  }
  return `게스트-${suffix}`;
}
