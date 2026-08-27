import { describe, expect, it } from 'vitest';
import { generateGuestNickname } from './guestNickname';

describe('generateGuestNickname', () => {
  it('"게스트-" 접두사와 5자리 소문자/숫자 접미사로 닉네임을 생성한다', () => {
    const nickname = generateGuestNickname();
    expect(nickname).toMatch(/^게스트-[a-z0-9]{5}$/);
  });

  it('호출할 때마다 매번 같은 값을 반환하지 않는다', () => {
    const nicknames = Array.from({ length: 20 }, () => generateGuestNickname());
    expect(new Set(nicknames).size).toBeGreaterThan(1);
  });
});
