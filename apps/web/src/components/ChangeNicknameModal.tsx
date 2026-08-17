import { useState, type FormEvent } from 'react';
import { ApiError } from '../api/client';
import { updateNickname } from '../api/room';

interface ChangeNicknameModalProps {
  roomId: string;
  userId: string;
  accessToken: string;
  currentNickname: string;
  onClose: () => void;
  onChanged: (nickname: string) => void;
}

/** 게스트가 게임 방 안에서 닉네임을 바꾸는 모달. 성공 시 채팅에 변경 안내가 자동으로 올라온다. */
export function ChangeNicknameModal({
  roomId,
  userId,
  accessToken,
  currentNickname,
  onClose,
  onChanged,
}: ChangeNicknameModalProps) {
  const [nickname, setNickname] = useState(currentNickname);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = nickname.trim();
    if (!trimmed || trimmed === currentNickname || submitting) {
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    try {
      await updateNickname(roomId, { userId, accessToken, nickname: trimmed });
      onChanged(trimmed);
      onClose();
    } catch (err) {
      setErrorMessage(
        err instanceof ApiError ? err.message : '닉네임 변경에 실패했습니다.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="w-full max-w-xs rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-base font-bold text-slate-800">
          닉네임 변경
        </h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <input
            autoFocus
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            maxLength={30}
            placeholder="새 닉네임"
            className="rounded-xl border border-slate-200 px-4 py-2.5 outline-none focus:border-purple-300"
          />
          {errorMessage && (
            <p className="text-sm text-rose-500">{errorMessage}</p>
          )}
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full px-5 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={
                submitting ||
                !nickname.trim() ||
                nickname.trim() === currentNickname
              }
              className="rounded-full bg-purple-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-purple-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
            >
              {submitting ? '변경 중...' : '변경'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
