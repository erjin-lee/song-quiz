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

export function SignupPage() {
  const { isAuthenticated, isInitialized, signup } = useSession();
  const navigate = useNavigate();

  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [nickNm, setNickNm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useDocumentMeta({
    title: '회원가입 | 노래맞히기',
    description: '노래맞히기 회원가입 화면입니다.',
  });

  if (!isInitialized) {
    return <div className="min-h-screen" />;
  }

  if (isAuthenticated) {
    return <Navigate to="/rooms" replace />;
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signup(loginId.trim(), password, nickNm.trim());
      navigate('/rooms');
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : '회원가입에 실패했습니다.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const isValid =
    loginId.trim().length >= 4 &&
    password.length >= 8 &&
    nickNm.trim().length > 0;

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-8 text-center shadow-lg">
        <div className="mb-8 flex justify-center">
          <Logo size="lg" />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            autoFocus
            value={loginId}
            onChange={(event) => setLoginId(event.target.value)}
            placeholder="아이디 (4자 이상)"
            maxLength={100}
            className={INPUT_CLASS}
          />
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="비밀번호 (8자 이상)"
            maxLength={255}
            className={INPUT_CLASS}
          />
          <input
            value={nickNm}
            onChange={(event) => setNickNm(event.target.value)}
            placeholder="닉네임"
            maxLength={100}
            className={INPUT_CLASS}
          />
          {error && <p className="text-sm text-rose-500">{error}</p>}
          <button
            type="submit"
            disabled={!isValid || submitting}
            className={PRIMARY_BUTTON_CLASS}
          >
            가입하기
          </button>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="text-xs text-slate-400 underline decoration-dotted underline-offset-2 hover:text-purple-500"
          >
            뒤로가기
          </button>
        </form>
      </div>
    </div>
  );
}
