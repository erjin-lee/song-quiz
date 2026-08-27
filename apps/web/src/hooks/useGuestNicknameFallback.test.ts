import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useGuestNicknameFallback } from './useGuestNicknameFallback';
import { useSession } from '../context/SessionContext';

vi.mock('../context/SessionContext', () => ({
  useSession: vi.fn(),
}));

vi.mock('../utils/guestNickname', () => ({
  generateGuestNickname: () => '게스트-fixed',
}));

const mockedUseSession = vi.mocked(useSession);

function makeSessionValue(
  overrides: Partial<ReturnType<typeof useSession>>,
): ReturnType<typeof useSession> {
  return {
    nickname: '',
    setNickname: vi.fn(),
    isAuthenticated: false,
    isInitialized: false,
    accountUserId: null,
    login: vi.fn(),
    signup: vi.fn(),
    logout: vi.fn(),
    ...overrides,
  };
}

describe('useGuestNicknameFallback', () => {
  it('아직 초기화되지 않았으면 닉네임을 부여하지 않는다', () => {
    const value = makeSessionValue({ isInitialized: false });
    mockedUseSession.mockReturnValue(value);

    renderHook(() => useGuestNicknameFallback());

    expect(value.setNickname).not.toHaveBeenCalled();
  });

  it('초기화됐고 비로그인이고 닉네임이 없으면 게스트 닉네임을 부여한다', () => {
    const value = makeSessionValue({
      isInitialized: true,
      isAuthenticated: false,
      nickname: '',
    });
    mockedUseSession.mockReturnValue(value);

    renderHook(() => useGuestNicknameFallback());

    expect(value.setNickname).toHaveBeenCalledWith('게스트-fixed');
  });

  it('이미 닉네임이 있으면 부여하지 않는다', () => {
    const value = makeSessionValue({
      isInitialized: true,
      isAuthenticated: false,
      nickname: '기존닉네임',
    });
    mockedUseSession.mockReturnValue(value);

    renderHook(() => useGuestNicknameFallback());

    expect(value.setNickname).not.toHaveBeenCalled();
  });

  it('로그인 상태면 게스트 닉네임을 부여하지 않는다', () => {
    const value = makeSessionValue({
      isInitialized: true,
      isAuthenticated: true,
      nickname: '',
    });
    mockedUseSession.mockReturnValue(value);

    renderHook(() => useGuestNicknameFallback());

    expect(value.setNickname).not.toHaveBeenCalled();
  });
});
