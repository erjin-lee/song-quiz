import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getMe, login as loginApi, signup as signupApi } from '../api/auth';
import { clearToken, getStoredToken, storeToken } from '../api/client';

const GUEST_NICKNAME_STORAGE_KEY = 'song-quiz:nickname';

interface SessionContextValue {
  nickname: string;
  setNickname: (nickname: string) => void;
  isAuthenticated: boolean;
  isInitialized: boolean;
  accountUserId: string | null;
  login: (loginId: string, password: string) => Promise<void>;
  signup: (loginId: string, password: string, nickNm: string) => Promise<void>;
  logout: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [guestNickname, setGuestNicknameState] = useState<string>(
    () => localStorage.getItem(GUEST_NICKNAME_STORAGE_KEY) ?? '',
  );
  const [accountNickname, setAccountNickname] = useState<string | null>(null);
  const [accountUserId, setAccountUserId] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!getStoredToken()) {
      setIsInitialized(true);
      return;
    }

    (async () => {
      try {
        const me = await getMe();
        if (!cancelled) {
          setAccountNickname(me.nickNm);
          setAccountUserId(me.userId);
          setIsAuthenticated(true);
        }
      } catch {
        if (!cancelled) {
          clearToken();
        }
      } finally {
        if (!cancelled) {
          setIsInitialized(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const setNickname = (next: string) => {
    localStorage.setItem(GUEST_NICKNAME_STORAGE_KEY, next);
    setGuestNicknameState(next);
  };

  const login = async (loginId: string, password: string) => {
    const result = await loginApi(loginId, password);
    storeToken(result.accessToken);
    setAccountNickname(result.nickNm);
    setAccountUserId(result.userId);
    setIsAuthenticated(true);
  };

  const signup = async (loginId: string, password: string, nickNm: string) => {
    const result = await signupApi(loginId, password, nickNm);
    storeToken(result.accessToken);
    setAccountNickname(result.nickNm);
    setAccountUserId(result.userId);
    setIsAuthenticated(true);
  };

  const logout = () => {
    clearToken();
    setAccountNickname(null);
    setAccountUserId(null);
    setIsAuthenticated(false);
  };

  const nickname =
    isAuthenticated && accountNickname ? accountNickname : guestNickname;

  const value = useMemo(
    () => ({
      nickname,
      setNickname,
      isAuthenticated,
      isInitialized,
      accountUserId,
      login,
      signup,
      logout,
    }),
    [nickname, isAuthenticated, isInitialized, accountUserId],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession은 SessionProvider 내부에서만 사용할 수 있다');
  }
  return context;
}
