import { useMemo, useState, type FormEvent } from 'react';
import type { QuizListItemDto } from '../types/quiz';
import { RoomActionOverlay } from './RoomActionOverlay';

const CREATE_AD_DELAY_MS = 3000;

export interface CreateRoomFormValues {
  roomTtl: string;
  quizId: string;
  isRandom: boolean;
  speedModeEnabled: boolean;
  maxUserCnt: number;
}

interface CreateRoomModalProps {
  quizzes: QuizListItemDto[];
  submitting: boolean;
  errorMessage: string | null;
  adEnabled: boolean;
  onSubmit: (values: CreateRoomFormValues) => void;
  onClose: () => void;
}

export function CreateRoomModal({
  quizzes,
  submitting,
  errorMessage,
  adEnabled,
  onSubmit,
  onClose,
}: CreateRoomModalProps) {
  const [roomTtl, setRoomTtl] = useState('');
  const [quizId, setQuizId] = useState(quizzes[0]?.quizId ?? '');
  const [quizSearch, setQuizSearch] = useState('');
  const [maxUserCnt, setMaxUserCnt] = useState(8);
  const [speedModeEnabled, setSpeedModeEnabled] = useState(false);
  const [isPreparingAd, setIsPreparingAd] = useState(false);

  const selectedQuiz = useMemo(
    () => quizzes.find((quiz) => quiz.quizId === quizId) ?? null,
    [quizzes, quizId],
  );

  const filteredQuizzes = useMemo(() => {
    const keyword = quizSearch.trim().toLowerCase();
    if (!keyword) {
      return quizzes;
    }
    return quizzes.filter((quiz) =>
      quiz.quizTtl.toLowerCase().includes(keyword),
    );
  }, [quizzes, quizSearch]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!roomTtl.trim() || !quizId) {
      return;
    }
    const values: CreateRoomFormValues = {
      roomTtl: roomTtl.trim(),
      quizId,
      isRandom: true,
      speedModeEnabled,
      maxUserCnt,
    };
    if (!adEnabled) {
      onSubmit(values);
      return;
    }
    setIsPreparingAd(true);
    setTimeout(() => {
      setIsPreparingAd(false);
      onSubmit(values);
    }, CREATE_AD_DELAY_MS);
  };

  if (isPreparingAd) {
    return <RoomActionOverlay message="방을 생성하는 중입니다..." />;
  }

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

          <div className="flex flex-col gap-1 text-sm text-slate-600">
            퀴즈 선택
            {selectedQuiz && (
              <div className="flex items-center gap-3 rounded-xl border border-purple-200 bg-purple-50 px-3 py-2">
                {selectedQuiz.thumbImgUrl ? (
                  <img
                    src={selectedQuiz.thumbImgUrl}
                    alt={selectedQuiz.quizTtl}
                    className="h-10 w-10 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-base">
                    🎵
                  </div>
                )}
                <span className="truncate font-semibold text-purple-700">
                  {selectedQuiz.quizTtl}
                </span>
              </div>
            )}
            <input
              type="text"
              value={quizSearch}
              onChange={(event) => setQuizSearch(event.target.value)}
              placeholder="퀴즈 검색"
              className="rounded-xl border border-slate-200 px-4 py-2.5 outline-none focus:border-purple-300"
            />
            <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-xl border border-slate-100 p-1">
              {filteredQuizzes.length === 0 && (
                <p className="px-3 py-2 text-center text-slate-400">
                  검색 결과가 없어요.
                </p>
              )}
              {filteredQuizzes.map((quiz) => (
                <button
                  key={quiz.quizId}
                  type="button"
                  onClick={() => setQuizId(quiz.quizId)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-left transition ${
                    quiz.quizId === quizId
                      ? 'bg-purple-100 text-purple-700'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  {quiz.thumbImgUrl ? (
                    <img
                      src={quiz.thumbImgUrl}
                      alt={quiz.quizTtl}
                      className="h-8 w-8 shrink-0 rounded-md object-cover"
                    />
                  ) : (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-sm">
                      🎵
                    </div>
                  )}
                  <span className="truncate">{quiz.quizTtl}</span>
                </button>
              ))}
            </div>
          </div>

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

          <label className="flex items-start gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={speedModeEnabled}
              onChange={(event) => setSpeedModeEnabled(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-purple-500 focus:ring-purple-300"
            />
            <span>
              스피드 모드
              <span className="block text-xs text-slate-400">
                한 명이라도 정답을 맞히면 6초 뒤 정답이 공개되고, 4초 뒤
                자동으로 다음 라운드로 넘어갑니다.
              </span>
            </span>
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
