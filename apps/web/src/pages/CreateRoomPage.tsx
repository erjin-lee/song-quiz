import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { RoomActionOverlay } from '../components/RoomActionOverlay';
import { useSession } from '../context/SessionContext';
import { useDocumentMeta } from '../hooks/useDocumentMeta';
import { useGuestNicknameFallback } from '../hooks/useGuestNicknameFallback';
import { ApiError } from '../api/client';
import { getAdConfig } from '../api/config';
import { getQuizSongCount, getQuizzes } from '../api/quiz';
import { createRoom } from '../api/room';
import { saveRoomSession } from '../utils/roomSession';
import type { QuizListItemDto } from '../types/quiz';

const CREATE_AD_DELAY_MS = 3000;
const ROOM_PASSWORD_MIN_LENGTH = 4;

export function CreateRoomPage() {
  const { nickname, isInitialized } = useSession();
  useGuestNicknameFallback();
  const navigate = useNavigate();

  useDocumentMeta({
    title: '방 만들기 | 노래맞히기',
    description: '새로운 노래맞히기 방을 만들어 친구들을 초대해보세요.',
  });

  const [quizzes, setQuizzes] = useState<QuizListItemDto[]>([]);
  const [adEnabled, setAdEnabled] = useState(false);

  const [roomTtl, setRoomTtl] = useState('');
  const [quizId, setQuizId] = useState('');
  const [quizSearch, setQuizSearch] = useState('');
  const [maxUserCnt, setMaxUserCnt] = useState(4);
  const [speedModeEnabled, setSpeedModeEnabled] = useState(false);
  const [isUnlisted, setIsUnlisted] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [password, setPassword] = useState('');
  const [selectedQuizSongCount, setSelectedQuizSongCount] = useState<
    number | null
  >(null);
  const [songLimit, setSongLimit] = useState<number | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [isPreparingAd, setIsPreparingAd] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    getQuizzes()
      .then((list) => {
        setQuizzes(list);
        setQuizId((prev) => prev || (list[0]?.quizId ?? ''));
      })
      .catch(() => setQuizzes([]));
  }, []);

  useEffect(() => {
    getAdConfig()
      .then((config) => setAdEnabled(config.adEnabled))
      .catch(() => setAdEnabled(false));
  }, []);

  const selectedQuiz = useMemo(
    () => quizzes.find((quiz) => quiz.quizId === quizId) ?? null,
    [quizzes, quizId],
  );

  useEffect(() => {
    if (!quizId) {
      setSelectedQuizSongCount(null);
      return;
    }
    let cancelled = false;
    getQuizSongCount(quizId)
      .then((count) => {
        if (!cancelled) {
          setSelectedQuizSongCount(count);
          // 퀴즈를 바꾸면 출제곡 수 기본값도 새 퀴즈의 전체 곡수로 초기화한다.
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

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!roomTtl.trim() || !quizId || !nickname || !isInitialized) {
      return;
    }

    const doCreate = async () => {
      setSubmitting(true);
      setErrorMessage(null);
      try {
        const result = await createRoom({
          roomTtl: roomTtl.trim(),
          quizId,
          isRandom: true,
          speedModeEnabled,
          maxUserCnt,
          nickname,
          songLimit: songLimit ?? undefined,
          isUnlisted,
          isPrivate,
          password: isPrivate ? password.trim() : undefined,
        });
        saveRoomSession({
          roomId: result.room.roomId,
          userId: result.userId,
          accessToken: result.accessToken,
        });
        navigate(`/rooms/${result.room.roomId}`, {
          state: {
            room: result.room,
            userId: result.userId,
            accessToken: result.accessToken,
          },
        });
      } catch (err) {
        setErrorMessage(
          err instanceof ApiError ? err.message : '방 생성에 실패했습니다.',
        );
        setSubmitting(false);
      }
    };

    if (!adEnabled) {
      doCreate();
      return;
    }
    setIsPreparingAd(true);
    setTimeout(() => {
      setIsPreparingAd(false);
      doCreate();
    }, CREATE_AD_DELAY_MS);
  };

  if (isPreparingAd) {
    return <RoomActionOverlay message="방을 생성하는 중입니다..." />;
  }

  return (
    <div className="min-h-screen px-4 py-8 sm:px-8">
      <div className="mx-auto flex max-w-lg flex-col gap-6">
        <header className="flex items-center justify-between">
          <Logo size="md" to="/rooms" />
        </header>

        <div className="rounded-3xl bg-white p-6 shadow-lg">
          <h1 className="mb-4 text-lg font-bold text-slate-800">방 만들기</h1>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1 text-sm text-slate-600">
              <span>방 제목 <span className="text-rose-400">*</span></span>
              <input
                autoFocus
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
                <div className="flex flex-col gap-1 rounded-xl border border-purple-200 bg-purple-50 px-3 py-2.5">
                  <p className="truncate text-xs font-semibold text-purple-700">
                    {selectedQuiz.quizTtl} ·{' '}
                    {selectedQuizSongCount !== null
                      ? `총 ${selectedQuizSongCount}곡`
                      : '곡 수 확인 중...'}
                  </p>
                  {selectedQuiz.quizDesc && (
                    <p className="text-xs text-purple-500">
                      {selectedQuiz.quizDesc}
                    </p>
                  )}
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
              최대 인원(2~50)대
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
              <span>
                비밀번호 설정
                <span className="block text-xs text-slate-400">
                  입장 시 비밀번호를 입력해야 들어올 수 있습니다.
                </span>
              </span>
            </label>

            {isPrivate && (
              <label className="flex flex-col gap-1 text-sm text-slate-600">
                <span>
                  비밀번호 <span className="text-rose-400">*</span>
                </span>
                <input
                  type="text"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={ROOM_PASSWORD_MIN_LENGTH}
                  maxLength={50}
                  placeholder={`${ROOM_PASSWORD_MIN_LENGTH}자 이상 입력`}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 outline-none focus:border-purple-300"
                />
              </label>
            )}

            {errorMessage && (
              <p className="text-sm text-rose-500">{errorMessage}</p>
            )}

            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => navigate('/rooms')}
                className="rounded-full px-5 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={
                  submitting ||
                  quizzes.length === 0 ||
                  !isInitialized ||
                  !roomTtl.trim() ||
                  !songLimit ||
                  songLimit < 1 ||
                  (selectedQuizSongCount !== null &&
                    songLimit > selectedQuizSongCount) ||
                  (isPrivate &&
                    password.trim().length < ROOM_PASSWORD_MIN_LENGTH)
                }
                className="rounded-full bg-purple-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-purple-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
              >
                {submitting ? '생성 중...' : '만들기'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
