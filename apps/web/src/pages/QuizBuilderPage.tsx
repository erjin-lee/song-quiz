import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { SongLinkAnswerModal } from '../components/SongLinkAnswerModal';
import { useSession } from '../context/SessionContext';
import { useDocumentMeta } from '../hooks/useDocumentMeta';
import { ApiError } from '../api/client';
import {
  autoFillYoutubeLink,
  createQuiz,
  getQuizForEdit,
  getRegistrationEligibility,
  registerSongFromMelon,
  searchDbSongs,
  searchMelonSongs,
  updateQuiz,
  validateYoutubeLink,
} from '../api/quiz-registration';
import {
  clearQuizDraft,
  getQuizDraftKey,
  loadQuizDraft,
  saveQuizDraft,
  type QuizDraftSong,
} from '../utils/quizDraft';
import type {
  DbSongSearchResultDto,
  MelonSongSearchResultDto,
} from '../types/quiz-registration';

/** apps/api MIN_USER_QUIZ_SONG_COUNT과 동일(quiz.constants.ts, ADR-0003 수동 미러링). */
const MIN_QUIZ_SONG_COUNT = 5;
const SEARCH_DEBOUNCE_MS = 300;

function formatRemainingTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.ceil((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}시간 ${minutes}분`;
  }
  return `${minutes}분`;
}

export function QuizBuilderPage() {
  const { quizId } = useParams<{ quizId: string }>();
  const isEdit = !!quizId;
  const draftKey = useMemo(() => getQuizDraftKey(quizId ?? null), [quizId]);
  const navigate = useNavigate();
  const { isAuthenticated, isInitialized } = useSession();

  useDocumentMeta({
    title: isEdit ? '퀴즈 수정 | 노래맞히기' : '퀴즈 만들기 | 노래맞히기',
  });

  const [quizTtl, setQuizTtl] = useState('');
  const [quizDesc, setQuizDesc] = useState('');
  const [songs, setSongs] = useState<QuizDraftSong[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [dbResults, setDbResults] = useState<DbSongSearchResultDto[]>([]);
  const [melonResults, setMelonResults] = useState<MelonSongSearchResultDto[]>(
    [],
  );
  const [searchPhase, setSearchPhase] = useState<'db' | 'melon'>('db');
  const [searching, setSearching] = useState(false);
  const [addingMelonSongId, setAddingMelonSongId] = useState<string | null>(
    null,
  );

  const [editingSongId, setEditingSongId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // 로그인 없이 URL로 직접 들어오는 경우를 막는다(주 진입 경로는 RoomListPage의
  // 로그인/등록 가능 여부 확인이지만, 이 페이지 자체도 최소한의 방어선을 둔다).
  useEffect(() => {
    if (isInitialized && !isAuthenticated) {
      navigate('/rooms');
    }
  }, [isInitialized, isAuthenticated, navigate]);

  useEffect(() => {
    if (!isInitialized || !isAuthenticated) {
      return;
    }
    let cancelled = false;

    const init = async () => {
      setLoadingInitial(true);
      setLoadError(null);
      setBlockedMessage(null);

      const draft = loadQuizDraft(draftKey);
      if (draft) {
        if (!cancelled) {
          setQuizTtl(draft.quizTtl);
          setQuizDesc(draft.quizDesc);
          setSongs(draft.songs);
          setLoadingInitial(false);
        }
        return;
      }

      if (isEdit && quizId) {
        try {
          const detail = await getQuizForEdit(quizId);
          if (cancelled) {
            return;
          }
          setQuizTtl(detail.quizTtl);
          setQuizDesc(detail.quizDesc ?? '');
          setSongs(
            detail.songs.map((song) => ({
              songId: song.songId,
              songNm: song.songNm,
              atstNm: song.atstNm,
              youtubeUrl: song.youtubeUrl,
              answers: song.answers,
              verificationToken: song.verificationToken,
              // 서버가 조회 시점에 다시 검증해서 토큰을 함께 내려준다 - 통과한
              // 곡은 바로 확인 완료 상태로 시작하고, 실패한 소수만 다시
              // 확인하면 된다(모든 곡을 처음부터 다시 확인시키지 않기 위함).
              status: song.verificationToken ? 'valid' : 'invalid',
              failReason: song.failReason,
            })),
          );
        } catch (err) {
          if (!cancelled) {
            setLoadError(
              err instanceof ApiError
                ? err.message
                : '퀴즈 정보를 불러오지 못했습니다.',
            );
          }
        }
      } else if (!isEdit) {
        try {
          const eligibility = await getRegistrationEligibility();
          if (!cancelled && !eligibility.eligible) {
            setBlockedMessage(
              `${formatRemainingTime(eligibility.remainingSeconds)} 후 다시 등록할 수 있어요.`,
            );
          }
        } catch {
          // 안내용 조회 실패는 조용히 무시한다 - 실제 강제는 제출 시 서버가 한다.
        }
      }

      if (!cancelled) {
        setLoadingInitial(false);
      }
    };

    init();
    return () => {
      cancelled = true;
    };
  }, [isInitialized, isAuthenticated, isEdit, quizId, draftKey]);

  // 진행 상태를 브라우저에 임시 저장한다(spec.md 4.5). 초기 로딩 중에는 아직
  // 비어 있는 값으로 덮어쓰지 않는다.
  useEffect(() => {
    if (loadingInitial) {
      return;
    }
    saveQuizDraft(draftKey, { quizTtl, quizDesc, songs });
  }, [draftKey, quizTtl, quizDesc, songs, loadingInitial]);

  useEffect(() => {
    const keyword = searchQuery.trim();
    setSearchPhase('db');
    setMelonResults([]);
    if (!keyword) {
      setDbResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const timer = setTimeout(() => {
      searchDbSongs(keyword)
        .then(setDbResults)
        .catch(() => setDbResults([]))
        .finally(() => setSearching(false));
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSearchMelonFallback = () => {
    const keyword = searchQuery.trim();
    if (!keyword) {
      return;
    }
    setSearchPhase('melon');
    setSearching(true);
    searchMelonSongs(keyword)
      .then(setMelonResults)
      .catch(() => setMelonResults([]))
      .finally(() => setSearching(false));
  };

  const addedSongIds = useMemo(
    () => new Set(songs.map((song) => song.songId)),
    [songs],
  );

  const handleAddDbSong = (result: DbSongSearchResultDto) => {
    if (addedSongIds.has(result.songId)) {
      return;
    }
    setSongs((prev) => [
      ...prev,
      {
        songId: result.songId,
        songNm: result.songNm,
        atstNm: result.atstNm,
        youtubeUrl: result.ytbLink ?? '',
        answers: [],
        verificationToken: null,
        status: 'unverified',
        failReason: null,
      },
    ]);
  };

  const handleAddMelonSong = async (result: MelonSongSearchResultDto) => {
    setAddingMelonSongId(result.melonSongId);
    try {
      const registered = await registerSongFromMelon(result.melonSongId);
      if (addedSongIds.has(registered.songId)) {
        return;
      }
      setSongs((prev) => [
        ...prev,
        {
          songId: registered.songId,
          songNm: registered.songNm,
          atstNm: result.artists.map((artist) => artist.atstNm).join(', '),
          youtubeUrl: registered.ytbLink ?? '',
          answers: [],
          verificationToken: null,
          status: 'unverified',
          failReason: null,
        },
      ]);
    } catch {
      // 실패해도 조용히 무시한다 - 유저가 다시 시도할 수 있다.
    } finally {
      setAddingMelonSongId(null);
    }
  };

  const handleRemoveSong = (songId: string) => {
    setSongs((prev) => prev.filter((song) => song.songId !== songId));
  };

  const updateSong = (songId: string, patch: Partial<QuizDraftSong>) => {
    setSongs((prev) =>
      prev.map((song) => (song.songId === songId ? { ...song, ...patch } : song)),
    );
  };

  const runValidation = async (
    songId: string,
    call: () => Promise<{
      valid: boolean;
      reason: string | null;
      youtubeUrl: string | null;
      verificationToken: string | null;
    }>,
  ) => {
    updateSong(songId, { status: 'checking', failReason: null });
    try {
      const result = await call();
      if (result.valid && result.verificationToken) {
        updateSong(songId, {
          status: 'valid',
          youtubeUrl: result.youtubeUrl ?? undefined,
          verificationToken: result.verificationToken,
          failReason: null,
        });
      } else {
        updateSong(songId, {
          status: 'invalid',
          verificationToken: null,
          failReason: result.reason ?? '링크를 확인할 수 없습니다.',
        });
      }
    } catch (err) {
      updateSong(songId, {
        status: 'invalid',
        verificationToken: null,
        failReason:
          err instanceof ApiError ? err.message : '링크 확인에 실패했습니다.',
      });
    }
  };

  const handleSaveSongEdit = (
    songId: string,
    youtubeUrl: string,
    answers: string[],
  ) => {
    updateSong(songId, { youtubeUrl, answers });
    setEditingSongId(null);
    runValidation(songId, () => validateYoutubeLink(songId, youtubeUrl));
  };

  const handleAutoFill = (songId: string) => {
    runValidation(songId, () => autoFillYoutubeLink(songId));
  };

  const canSubmit =
    songs.length >= MIN_QUIZ_SONG_COUNT &&
    songs.every((song) => song.status === 'valid' && song.verificationToken);

  const handleSubmit = async () => {
    if (!canSubmit || submitting) {
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload = {
        quizTtl: quizTtl.trim(),
        quizDesc: quizDesc.trim() || undefined,
        songs: songs.map((song) => ({
          songId: song.songId,
          youtubeUrl: song.youtubeUrl,
          answers: song.answers,
          verificationToken: song.verificationToken as string,
        })),
      };
      if (isEdit && quizId) {
        await updateQuiz(quizId, payload);
      } else {
        await createQuiz(payload);
      }
      clearQuizDraft(draftKey);
      navigate('/mypage', {
        state: {
          message: isEdit
            ? '수정 신청이 접수됐어요. 처리 결과는 알림으로 알려드려요.'
            : '등록 신청이 접수됐어요. 처리 결과는 알림으로 알려드려요.',
        },
      });
    } catch (err) {
      setSubmitError(
        err instanceof ApiError
          ? err.message
          : isEdit
            ? '퀴즈 수정에 실패했습니다.'
            : '퀴즈 등록에 실패했습니다.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const editingSong = songs.find((song) => song.songId === editingSongId);
  const showMelonFallback =
    searchPhase === 'db' &&
    !searching &&
    searchQuery.trim().length > 0 &&
    dbResults.length === 0;

  if (!isInitialized || (isInitialized && !isAuthenticated)) {
    return null;
  }

  return (
    <div className="min-h-screen px-4 py-8 sm:px-8">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <header className="flex items-center justify-between">
          <Logo size="md" to="/rooms" />
        </header>

        <div className="rounded-3xl bg-white p-6 shadow-lg">
          <h1 className="mb-4 text-lg font-bold text-slate-800">
            {isEdit ? '퀴즈 수정' : '퀴즈 만들기'}
          </h1>

          {loadingInitial && (
            <p className="text-sm text-slate-400">불러오는 중...</p>
          )}

          {loadError && <p className="text-sm text-rose-500">{loadError}</p>}

          {!loadingInitial && !loadError && blockedMessage && (
            <div className="flex flex-col items-center gap-3 rounded-2xl bg-purple-50 px-5 py-10 text-center">
              <span className="text-3xl">⏳</span>
              <p className="text-sm font-semibold text-purple-700">
                {blockedMessage}
              </p>
              <button
                type="button"
                onClick={() => navigate('/rooms')}
                className="mt-1 rounded-full bg-purple-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-purple-600"
              >
                방 목록으로
              </button>
            </div>
          )}

          {!loadingInitial && !loadError && !blockedMessage && (
            <div className="flex flex-col gap-4">
              <label className="flex flex-col gap-1 text-sm text-slate-600">
                <span>
                  퀴즈 제목 <span className="text-rose-400">*</span>
                </span>
                <input
                  value={quizTtl}
                  onChange={(event) => setQuizTtl(event.target.value)}
                  maxLength={200}
                  placeholder="예) 내가 좋아하는 노래 모음"
                  className="rounded-xl border border-slate-200 px-4 py-2.5 outline-none focus:border-purple-300"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm text-slate-600">
                퀴즈 설명
                <textarea
                  value={quizDesc}
                  onChange={(event) => setQuizDesc(event.target.value)}
                  maxLength={1000}
                  rows={2}
                  placeholder="설명(선택)"
                  className="resize-none rounded-xl border border-slate-200 px-4 py-2.5 outline-none focus:border-purple-300"
                />
              </label>

              <div className="flex flex-col gap-2 text-sm text-slate-600">
                <span>
                  곡 검색 · 담은 곡 {songs.length}곡
                  {songs.length < MIN_QUIZ_SONG_COUNT &&
                    ` (최소 ${MIN_QUIZ_SONG_COUNT}곡 필요)`}
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="곡명 또는 아티스트명으로 검색"
                  className="rounded-xl border border-slate-200 px-4 py-2.5 outline-none focus:border-purple-300"
                />

                {searchQuery.trim() && (
                  <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-xl border border-slate-100 p-1">
                    {searching && (
                      <p className="px-3 py-2 text-center text-slate-400">
                        검색 중...
                      </p>
                    )}
                    {!searching && searchPhase === 'db' && (
                      <>
                        {dbResults.map((result) => (
                          <button
                            key={result.songId}
                            type="button"
                            disabled={addedSongIds.has(result.songId)}
                            onClick={() => handleAddDbSong(result)}
                            className="flex items-center gap-2 rounded-lg px-3 py-2 text-left transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
                          >
                            <span className="truncate">
                              {result.displayLabel}
                            </span>
                            {addedSongIds.has(result.songId) && (
                              <span className="ml-auto shrink-0 text-xs">
                                이미 담음
                              </span>
                            )}
                          </button>
                        ))}
                        {showMelonFallback && (
                          <button
                            type="button"
                            onClick={handleSearchMelonFallback}
                            className="rounded-lg px-3 py-2 text-left text-purple-500 transition hover:bg-purple-50"
                          >
                            찾는 곡이 없나요? 멜론에서 검색하기 →
                          </button>
                        )}
                      </>
                    )}
                    {!searching && searchPhase === 'melon' && (
                      <>
                        {melonResults.length === 0 && (
                          <p className="px-3 py-2 text-center text-slate-400">
                            검색 결과가 없어요.
                          </p>
                        )}
                        {melonResults.map((result) => (
                          <button
                            key={result.melonSongId}
                            type="button"
                            disabled={addingMelonSongId === result.melonSongId}
                            onClick={() => handleAddMelonSong(result)}
                            className="flex items-center gap-2 rounded-lg px-3 py-2 text-left transition hover:bg-slate-50 disabled:cursor-wait"
                          >
                            <span className="truncate">
                              {result.displayLabel}
                            </span>
                            {addingMelonSongId === result.melonSongId && (
                              <span className="ml-auto shrink-0 text-xs text-slate-400">
                                담는 중...
                              </span>
                            )}
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                {songs.map((song) => (
                  <div
                    key={song.songId}
                    className="flex items-center gap-3 rounded-xl border border-slate-100 px-4 py-3"
                  >
                    <button
                      type="button"
                      onClick={() => setEditingSongId(song.songId)}
                      className="flex min-w-0 flex-1 flex-col items-start text-left"
                    >
                      <span className="truncate text-sm font-semibold text-slate-700">
                        {song.songNm}
                      </span>
                      <span className="truncate text-xs text-slate-400">
                        {song.atstNm}
                      </span>
                    </button>

                    {!song.youtubeUrl && song.status !== 'checking' && (
                      <button
                        type="button"
                        onClick={() => handleAutoFill(song.songId)}
                        className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200"
                      >
                        자동으로 찾기
                      </button>
                    )}

                    <span className="shrink-0 text-lg" title={song.failReason ?? undefined}>
                      {song.status === 'checking' && '⏳'}
                      {song.status === 'valid' && '✅'}
                      {song.status === 'invalid' && '⚠️'}
                      {song.status === 'unverified' && '❔'}
                    </span>

                    <button
                      type="button"
                      onClick={() => handleRemoveSong(song.songId)}
                      className="shrink-0 text-slate-300 hover:text-rose-500"
                      aria-label={`${song.songNm} 빼기`}
                    >
                      ×
                    </button>
                  </div>
                ))}
                {songs.some((song) => song.status === 'invalid') && (
                  <p className="text-xs text-rose-500">
                    확인에 실패한 곡이 있어요. 카드를 눌러 링크를 다시
                    확인해주세요.
                  </p>
                )}
              </div>

              <p className="text-xs text-slate-400">
                작성 중인 내용은 이 브라우저에 임시 저장돼요. 브라우저 데이터를
                지우거나 다른 기기로 접속하면 사라질 수 있어요.
              </p>

              {submitError && (
                <p className="text-sm text-rose-500">{submitError}</p>
              )}

              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => navigate('/mypage')}
                  className="rounded-full px-5 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!canSubmit || !quizTtl.trim() || submitting}
                  className="rounded-full bg-purple-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-purple-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                >
                  {submitting
                    ? isEdit
                      ? '수정 신청 중...'
                      : '등록 신청 중...'
                    : isEdit
                      ? '수정하기'
                      : '등록하기'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {editingSong && (
        <SongLinkAnswerModal
          song={editingSong}
          onClose={() => setEditingSongId(null)}
          onSave={(youtubeUrl, answers) =>
            handleSaveSongEdit(editingSong.songId, youtubeUrl, answers)
          }
        />
      )}
    </div>
  );
}
