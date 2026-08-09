import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

const NICKNAME_STORAGE_KEY = 'song-quiz:nickname';

interface SessionContextValue {
  nickname: string;
  setNickname: (nickname: string) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [nickname, setNicknameState] = useState<string>(
    () => localStorage.getItem(NICKNAME_STORAGE_KEY) ?? '',
  );

  const setNickname = (next: string) => {
    localStorage.setItem(NICKNAME_STORAGE_KEY, next);
    setNicknameState(next);
  };

  const value = useMemo(() => ({ nickname, setNickname }), [nickname]);

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
