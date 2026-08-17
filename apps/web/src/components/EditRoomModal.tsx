import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ApiError } from '../api/client';
import { getQuizSongCount, getQuizzes } from '../api/quiz';
import { updateRoom } from '../api/room';
import type { RoomItemDto } from '../types/room';
import type { QuizListItemDto } from '../types/quiz';

interface EditRoomModalProps {
  room: RoomItemDto;
  userId: string;
  accessToken: string;
  onClose: () => void;
  onUpdated: (room: RoomItemDto) => void;
}

/** 게임 시작 전(WAITING)/종료 후(FINISHED)에 방장이 방 정보를 수정하는 모달. */
export function EditRoomModal({
  room,
  userId,
  accessToken,
  onClose,
  onUpdated,
}: EditRoomModalProps) {
  const [quizzes, setQuizzes] = useState<QuizListItemDto[]>([]);
  const [quizSearch, setQuizSearch] = useState('');

  const [roomTtl, setRoomTtl] = useState(room.roomTtl);
  const [quizId, setQuizId] = useState(room.quizId);
  const [maxUserCnt, setMaxUserCnt] = useState(room.maxUserCnt);
  const [speedModeEnabled, setSpeedModeEnabled] = useState(
    room.speedModeEnabled,
  );
  const [selectedQuizSongCount, setSelectedQuizSongCount] = useState<
    number | null
  >(room.songCount);
  const [songLimit, setSongLimit] = useState<number | null>(room.songLimit);
  const [isUnlisted, setIsUnlisted] = useState(room.isUnlisted);
  const [isPrivate, setIsPrivate] = useState(room.isPrivate);
  const [password, setPassword] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    getQuizzes()
      .then(setQuizzes)
      .catch(() => setQuizzes([]));
  }, []);

  const selectedQuiz = useMemo(
    () => quizzes.find((quiz) => quiz.quizId === quizId) ?? null,
    [quizzes, quizId],
  );

  useEffect(() => {
    if (!quizId || quizId === room.quizId) {
      return;
    }
    let cancelled = false;
    getQuizSongCount(quizId)
      .then((count) => {
        if (!cancelled) {
          setSelectedQuizSongCount(count);
          setSongLimit(count);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSelectedQuizSongCount(null);
          setSongLimit(null);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizId]);

  const filteredQuizzes = useMemo(() => {
    const keyword = quizSearch.trim().toLowerCase();
    if (!keyword) {
      return quizzes;
    }
    return quizzes.filter((quiz) =>
      quiz.quizTtl.toLowerCase().includes(keyword),
    );
  }, [quizzes, quizSearch]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!roomTtl.trim() || !quizId || !songLimit || songLimit < 1) {
      return;
    }
    if (isPrivate && room.isPrivate === false && !password.trim()) {
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    try {
      const updated = await updateRoom(room.roomId, {
        userId,
        accessToken,
        roomTtl: roomTtl.trim(),
        quizId,
        isRandom: room.isRandom,
        speedModeEnabled,
        maxUserCnt,
        songLimit,
        isUnlisted,
        isPrivate,
        password: isPrivate && password.trim() ? password.trim() : undefined,
      });
      onUpdated(updated);
      onClose();
    } catch (err) {
      setErrorMessage(
        err instanceof ApiError ? err.message : '방 정보 수정에 실패했습니다.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const passwordRequiredButMissing =
    isPrivate && !room.isPrivate && !password.trim();

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 shrink-0 text-lg font-bold text-slate-800">
          방 정보 수정
        </h2>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 overflow-y-auto pr-1"
        >
          <label className="flex flex-col gap-1 text-sm text-slate-600">
            <span>방 제목 <span className="text-rose-400">*</span></span>
            <input
              autoFocus
              value={roomTtl}
              onChange={(event) => setRoomTtl(event.target.value)}
              maxLength={100}
              className="rounded-xl border border-slate-200 px-4 py-2.5 outline-none focus:border-purple-300"
            />
          </label>

          <div className="flex flex-col gap-1 text-sm text-slate-600">
            퀴즈 선택
            {selectedQuiz && (
              <div className="flex flex-col gap-1 rounded-xl border border-purple-200 bg-purple-50 px-3 py-2.5">
                <p className="truncate text-xs font-semibold text-purple-700">
                  {selectedQuiz.quizTtl} ·{' '}
                  {selectedQuizSongCount !== null
                    ? `총 ${selectedQuizSongCount}곡`
                    : '곡 수 확인 중...'}
                </p>
              </div>
            )}
            <input
              type="text"
              value={quizSearch}
              onChange={(event) => setQuizSearch(event.target.value)}
              placeholder="퀴즈 검색"
              className="rounded-xl border border-slate-200 px-4 py-2.5 outline-none focus:border-purple-300"
            />
            <div className="flex max-h-32 flex-col gap-1 overflow-y-auto rounded-xl border border-slate-100 p-1">
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
                  <span className="truncate">{quiz.quizTtl}</span>
                  {quiz.quizId === quizId && (
                    <span className="ml-auto shrink-0 text-purple-500">
                      ✓
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-1 text-sm text-slate-600">
            출제곡 수
            {selectedQuizSongCount !== null
              ? `(1~${selectedQuizSongCount})`
              : ''}
            <input
              type="number"
              min={1}
              max={selectedQuizSongCount ?? 1}
              value={songLimit ?? ''}
              onChange={(event) => setSongLimit(Number(event.target.value))}
              disabled={!selectedQuizSongCount}
              className="rounded-xl border border-slate-200 px-4 py-2.5 outline-none focus:border-purple-300 disabled:bg-slate-50 disabled:text-slate-400"
            />
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

          <label className="flex items-start gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={speedModeEnabled}
              onChange={(event) => setSpeedModeEnabled(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-purple-500 focus:ring-purple-300"
            />
            <span>스피드 모드</span>
          </label>

          <label className="flex items-start gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={isUnlisted}
              onChange={(event) => setIsUnlisted(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-purple-500 focus:ring-purple-300"
            />
            <span>
              비공개방
              <span className="block text-xs text-slate-400">
                방 목록에 노출되지 않고, 링크를 아는 사람만 입장할 수
                있습니다.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(event) => {
                setIsPrivate(event.target.checked);
                if (!event.target.checked) {
                  setPassword('');
                }
              }}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-purple-500 focus:ring-purple-300"
            />
            <span>비밀번호 설정</span>
          </label>

          {isPrivate && (
            <label className="flex flex-col gap-1 text-sm text-slate-600">
              비밀번호
              {room.isPrivate && (
                <span className="text-xs text-slate-400">
                  비워두면 기존 비밀번호가 그대로 유지됩니다.
                </span>
              )}
              <input
                type="text"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                maxLength={50}
                placeholder={room.isPrivate ? '변경할 비밀번호(선택)' : '입장 비밀번호'}
                className="rounded-xl border border-slate-200 px-4 py-2.5 outline-none focus:border-purple-300"
              />
            </label>
          )}

          {errorMessage && (
            <p className="text-sm text-rose-500">{errorMessage}</p>
          )}

          <div className="mt-2 flex shrink-0 justify-end gap-2">
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
                !roomTtl.trim() ||
                !songLimit ||
                songLimit < 1 ||
                (selectedQuizSongCount !== null &&
                  songLimit > selectedQuizSongCount) ||
                passwordRequiredButMissing
              }
              className="rounded-full bg-purple-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-purple-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
            >
              {submitting ? '저장 중...' : '저장'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
