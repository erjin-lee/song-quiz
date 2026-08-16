import { useEffect } from 'react';
import { useSession } from '../context/SessionContext';
import { generateGuestNickname } from '../utils/guestNickname';

/** 로그인하지 않았고 닉네임도 없는 유저에게 "게스트-xxxxx" 닉네임을 자동으로 부여한다. */
export function useGuestNicknameFallback(): void {
  const { nickname, setNickname, isAuthenticated, isInitialized } =
    useSession();

  useEffect(() => {
    if (isInitialized && !isAuthenticated && !nickname) {
      setNickname(generateGuestNickname());
    }
  }, [isInitialized, isAuthenticated, nickname, setNickname]);
}
