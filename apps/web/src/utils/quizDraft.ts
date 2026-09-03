/** 퀴즈 빌더 진행 상태 임시 저장(spec.md 4.5). roomSession.ts와 동일한 패턴. */

export type QuizDraftSongStatus = 'unverified' | 'checking' | 'valid' | 'invalid';

export interface QuizDraftSong {
  songId: string;
  songNm: string;
  atstNm: string;
  youtubeUrl: string;
  answers: string[];
  verificationToken: string | null;
  status: QuizDraftSongStatus;
  failReason: string | null;
}

export interface QuizDraft {
  quizTtl: string;
  quizDesc: string;
  songs: QuizDraftSong[];
}

/** 새 퀴즈와 퀴즈별 수정 화면의 임시 저장을 서로 구분해서 덮어쓰지 않게 한다. */
export function getQuizDraftKey(quizId: string | null): string {
  return quizId
    ? `song-quiz:quiz-draft:edit:${quizId}`
    : 'song-quiz:quiz-draft:new';
}

export function saveQuizDraft(key: string, draft: QuizDraft): void {
  localStorage.setItem(key, JSON.stringify(draft));
}

export function loadQuizDraft(key: string): QuizDraft | null {
  const raw = localStorage.getItem(key);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.quizTtl === 'string' &&
      typeof parsed?.quizDesc === 'string' &&
      Array.isArray(parsed?.songs)
    ) {
      return parsed as QuizDraft;
    }
  } catch {
    // 저장된 값이 손상된 경우 무시하고 null 처리한다.
  }
  return null;
}

export function clearQuizDraft(key: string): void {
  localStorage.removeItem(key);
}
