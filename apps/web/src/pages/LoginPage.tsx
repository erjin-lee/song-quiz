import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { useSession } from '../context/SessionContext';
import { useDocumentMeta } from '../hooks/useDocumentMeta';
import { ApiError } from '../api/client';

const INPUT_CLASS =
  'rounded-full border border-purple-100 bg-purple-50/60 px-5 py-3 text-center text-sm outline-none placeholder:text-slate-400 focus:border-purple-300';
const PRIMARY_BUTTON_CLASS =
  'rounded-full bg-purple-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-purple-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400';
const SECONDARY_BUTTON_CLASS =
  'flex-1 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-500 transition hover:bg-slate-50';

export function LoginPage() {
  const { nickname, setNickname, isAuthenticated, isInitialized, login } =
    useSession();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'auth' | 'guest'>('auth');

  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  const [guestDraft, setGuestDraft] = useState(nickname);

  useDocumentMeta({
    title: '노래맞히기 | 실시간 노래 맞히기 게임',
    description:
      '아이유 노래 맞히기(맞추기), 인기차트·인기곡 노래 맞히기(맞추기)까지 친구들과 함께 즐기는 실시간 노래맞히기(노래맞추기, 노맞) 게임입니다.',
  });

  if (!isInitialized) {
    return <div className="min-h-screen" />;
  }

  if (isAuthenticated) {
    return <Navigate to="/rooms" replace />;
  }

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setLoginError(null);
    setLoggingIn(true);
    try {
      await login(loginId.trim(), password);
      navigate('/rooms');
    } catch (err) {
      setLoginError(
        err instanceof ApiError ? err.message : '로그인에 실패했습니다.',
      );
    } finally {
      setLoggingIn(false);
    }
  };

  const handleGuestSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = guestDraft.trim();
    if (!trimmed) {
      return;
    }
    setNickname(trimmed);
    navigate('/rooms');
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-8 text-center shadow-lg">
        <div className="mb-8 flex justify-center">
          <Logo size="lg" />
        </div>

        {mode === 'auth' ? (
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <input
              autoFocus
              value={loginId}
              onChange={(event) => setLoginId(event.target.value)}
              placeholder="아이디"
              className={INPUT_CLASS}
            />
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="비밀번호"
              className={INPUT_CLASS}
            />
            {loginError && (
              <p className="text-sm text-rose-500">{loginError}</p>
            )}
            <button
              type="submit"
              disabled={!loginId.trim() || !password || loggingIn}
              className={PRIMARY_BUTTON_CLASS}
            >
              로그인
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => navigate('/signup')}
                className={SECONDARY_BUTTON_CLASS}
              >
                회원가입
              </button>
              <button
                type="button"
                onClick={() => setMode('guest')}
                className={SECONDARY_BUTTON_CLASS}
              >
                게스트 모드
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleGuestSubmit} className="flex flex-col gap-4">
            <input
              autoFocus
              value={guestDraft}
              onChange={(event) => setGuestDraft(event.target.value)}
              maxLength={30}
              placeholder="닉네임을 입력하세요"
              className={INPUT_CLASS}
            />
            <button
              type="submit"
              disabled={!guestDraft.trim()}
              className={PRIMARY_BUTTON_CLASS}
            >
              시작하기
            </button>
            <button
              type="button"
              onClick={() => setMode('auth')}
              className="text-xs text-slate-400 underline decoration-dotted underline-offset-2 hover:text-purple-500"
            >
              뒤로가기
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
