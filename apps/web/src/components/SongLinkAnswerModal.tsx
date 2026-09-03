import { useEffect, useState, type FormEvent } from 'react';
import { getAnswerCandidates } from '../api/quiz-registration';
import type { QuizDraftSong } from '../utils/quizDraft';

const ANSWER_MAX_LENGTH = 300;

/**
 * 클라이언트 형식 검증(spec.md 3.3-①) - UX용 즉시 피드백일 뿐, 신뢰 경계는
 * 서버 재검증(POST .../youtube-link/validate)이다(ADR-0009).
 */
function isPlausibleYoutubeUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:') {
      return false;
    }
    if (url.hostname === 'youtu.be') {
      return url.pathname.split('/').filter(Boolean).length === 1;
    }
    const watchHostnames = ['youtube.com', 'www.youtube.com', 'm.youtube.com'];
    return (
      watchHostnames.includes(url.hostname) &&
      url.pathname === '/watch' &&
      !!url.searchParams.get('v')
    );
  } catch {
    return false;
  }
}

interface SongLinkAnswerModalProps {
  song: QuizDraftSong;
  onClose: () => void;
  onSave: (youtubeUrl: string, answers: string[]) => void;
}

/** 곡 카드 클릭 시 여는 링크·정답 편집 모달(spec.md 4.4). 저장은 부모가 비동기로 검증한다. */
export function SongLinkAnswerModal({
  song,
  onClose,
  onSave,
}: SongLinkAnswerModalProps) {
  const [youtubeUrl, setYoutubeUrl] = useState(song.youtubeUrl);
  const [answers, setAnswers] = useState<string[]>(song.answers);
  const [answerDraft, setAnswerDraft] = useState('');
  const [loadingCandidates, setLoadingCandidates] = useState(false);

  useEffect(() => {
    if (answers.length > 0) {
      return;
    }
    let cancelled = false;
    setLoadingCandidates(true);
    getAnswerCandidates(song.songId)
      .then((candidates) => {
        if (!cancelled) {
          setAnswers(candidates);
        }
      })
      .catch(() => {
        // 후보 조회 실패는 조용히 무시한다(유저가 직접 입력하면 된다).
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingCandidates(false);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song.songId]);

  const urlTrimmed = youtubeUrl.trim();
  const urlValid = urlTrimmed.length === 0 || isPlausibleYoutubeUrl(urlTrimmed);

  const handleAddAnswer = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = answerDraft.trim();
    if (!trimmed || answers.includes(trimmed)) {
      setAnswerDraft('');
      return;
    }
    setAnswers((prev) => [...prev, trimmed]);
    setAnswerDraft('');
  };

  const handleRemoveAnswer = (answer: string) => {
    setAnswers((prev) => prev.filter((item) => item !== answer));
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!urlTrimmed || !urlValid || answers.length === 0) {
      return;
    }
    onSave(urlTrimmed, answers);
  };

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-1 shrink-0 text-lg font-bold text-slate-800">
          {song.songNm}
        </h2>
        <p className="mb-4 shrink-0 text-sm text-slate-500">{song.atstNm}</p>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 overflow-y-auto pr-1"
        >
          <label className="flex flex-col gap-1 text-sm text-slate-600">
            <span>
              유튜브 링크 <span className="text-rose-400">*</span>
            </span>
            <input
              autoFocus
              type="text"
              value={youtubeUrl}
              onChange={(event) => setYoutubeUrl(event.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-purple-300"
            />
            {!urlValid && (
              <span className="text-xs text-rose-500">
                올바른 유튜브 링크 형식이 아니에요.
              </span>
            )}
          </label>

          <div className="flex flex-col gap-1 text-sm text-slate-600">
            <span>
              정답 <span className="text-rose-400">*</span>
              {loadingCandidates && (
                <span className="ml-1 text-xs text-slate-400">
                  (후보 불러오는 중...)
                </span>
              )}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {answers.map((answer) => (
                <span
                  key={answer}
                  className="flex items-center gap-1 rounded-full bg-purple-50 px-3 py-1 text-xs font-medium text-purple-700"
                >
                  {answer}
                  <button
                    type="button"
                    onClick={() => handleRemoveAnswer(answer)}
                    className="text-purple-400 hover:text-purple-600"
                    aria-label={`${answer} 삭제`}
                  >
                    ×
                  </button>
                </span>
              ))}
              {answers.length === 0 && (
                <span className="text-xs text-slate-400">
                  정답을 하나 이상 추가해주세요.
                </span>
              )}
            </div>
            <div className="mt-1 flex gap-1.5">
              <input
                type="text"
                value={answerDraft}
                onChange={(event) => setAnswerDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    handleAddAnswer(event);
                  }
                }}
                maxLength={ANSWER_MAX_LENGTH}
                placeholder="정답 추가 후 Enter"
                className="flex-1 rounded-xl border border-slate-200 px-4 py-2 text-sm outline-none focus:border-purple-300"
              />
              <button
                type="button"
                onClick={handleAddAnswer}
                className="rounded-full bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200"
              >
                추가
              </button>
            </div>
          </div>

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
              disabled={!urlTrimmed || !urlValid || answers.length === 0}
              className="rounded-full bg-purple-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-purple-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
            >
              확인
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
