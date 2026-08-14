'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  AUTH_EXPIRED_EVENT,
  clearToken,
  getStoredToken,
  verifyLogin,
} from '@/lib/api-client';

interface AuthContextValue {
  isAuthenticated: boolean;
  isInitialized: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // 서버 렌더링과 클라이언트 첫 렌더링을 동일하게 맞추기 위해 초기값은
  // 항상 false로 시작하고, sessionStorage 확인은 마운트 이후로 미룬다
  // (hydration mismatch 방지). isInitialized로 그 확인이 끝났는지 구분해서,
  // RequireAuth가 확인 전에 성급하게 /login으로 리다이렉트하지 않게 한다.
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    setIsAuthenticated(getStoredToken() !== null);
    setIsInitialized(true);
  }, []);

  useEffect(() => {
    // api-client가 401 응답을 받아 토큰을 지웠을 때도 인증 상태를 즉시 반영해
    // RequireAuth가 로그인 화면으로 리다이렉트하게 한다.
    const handleAuthExpired = () => setIsAuthenticated(false);
    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    return () => {
      window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    };
  }, []);

  const login = async (username: string, password: string) => {
    await verifyLogin(username, password);
    setIsAuthenticated(true);
  };

  const logout = () => {
    clearToken();
    setIsAuthenticated(false);
  };

  const value = useMemo(
    () => ({ isAuthenticated, isInitialized, login, logout }),
    [isAuthenticated, isInitialized],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth는 AuthProvider 내부에서만 사용할 수 있다');
  }
  return context;
}
