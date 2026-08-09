import { useState, type FormEvent } from 'react';
import type { QuizListItemDto } from '../types/quiz';

export interface CreateRoomFormValues {
  roomTtl: string;
  quizId: string;
  isRandom: boolean;
  maxUserCnt: number;
}

interface CreateRoomModalProps {
  quizzes: QuizListItemDto[];
  submitting: boolean;
  errorMessage: string | null;
  onSubmit: (values: CreateRoomFormValues) => void;
  onClose: () => void;
}

export function CreateRoomModal({
  quizzes,
  submitting,
  errorMessage,
  onSubmit,
  onClose,
}: CreateRoomModalProps) {
  const [roomTtl, setRoomTtl] = useState('');
  const [quizId, setQuizId] = useState(quizzes[0]?.quizId ?? '');
  const [isRandom, setIsRandom] = useState(false);
  const [maxUserCnt, setMaxUserCnt] = useState(8);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!roomTtl.trim() || !quizId) {
      return;
    }
    onSubmit({ roomTtl: roomTtl.trim(), quizId, isRandom, maxUserCnt });
  };

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-bold text-slate-800">방 만들기</h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm text-slate-600">
            방 제목
            <input
              value={roomTtl}
              onChange={(event) => setRoomTtl(event.target.value)}
              maxLength={100}
              placeholder="예) 아이유 노래 맞추기 방"
              className="rounded-xl border border-slate-200 px-4 py-2.5 outline-none focus:border-purple-300"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm text-slate-600">
            퀴즈 선택
            <select
              value={quizId}
              onChange={(event) => setQuizId(event.target.value)}
              className="rounded-xl border border-slate-200 px-4 py-2.5 outline-none focus:border-purple-300"
            >
              {quizzes.map((quiz) => (
                <option key={quiz.quizId} value={quiz.quizId}>
                  {quiz.quizTtl}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm text-slate-600">
            최대 인원(2~50)
            <input
              type="number"
              min={2}
              max={50}
              value={maxUserCnt}
              onChange={(event) => setMaxUserCnt(Number(event.target.value))}
              className="rounded-xl border border-slate-200 px-4 py-2.5 outline-none focus:border-purple-300"
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={isRandom}
              onChange={(event) => setIsRandom(event.target.checked)}
              className="h-4 w-4 accent-purple-500"
            />
            출제곡 랜덤 여부
          </label>

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
              disabled={submitting || quizzes.length === 0}
              className="rounded-full bg-purple-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-purple-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
            >
              {submitting ? '생성 중...' : '만들기'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
