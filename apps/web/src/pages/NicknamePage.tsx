import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { useSession } from '../context/SessionContext';

export function NicknamePage() {
  const { nickname, setNickname } = useSession();
  const [draft, setDraft] = useState(nickname);
  const navigate = useNavigate();

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = draft.trim();
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

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={30}
            placeholder="닉네임을 입력하세요"
            className="rounded-full border border-purple-100 bg-purple-50/60 px-5 py-3 text-center text-sm outline-none placeholder:text-slate-400 focus:border-purple-300"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className="rounded-full bg-purple-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-purple-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
          >
            시작하기
          </button>
        </form>
      </div>
    </div>
  );
}
