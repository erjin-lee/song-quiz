import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearQuizDraft,
  getQuizDraftKey,
  loadQuizDraft,
  saveQuizDraft,
  type QuizDraft,
} from './quizDraft';

const DRAFT: QuizDraft = {
  quizTtl: '내 퀴즈',
  quizDesc: '설명',
  songs: [
    {
      songId: 's1',
      songNm: '봄날',
      atstNm: '방탄소년단',
      youtubeUrl: 'https://www.youtube.com/watch?v=v1',
      answers: ['봄날'],
      verificationToken: 'token',
      status: 'valid',
      failReason: null,
    },
  ],
};

describe('quizDraft', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('새 퀴즈와 수정 화면의 키를 서로 다르게 만든다', () => {
    expect(getQuizDraftKey(null)).toBe('song-quiz:quiz-draft:new');
    expect(getQuizDraftKey('quiz-1')).toBe('song-quiz:quiz-draft:edit:quiz-1');
    expect(getQuizDraftKey(null)).not.toBe(getQuizDraftKey('quiz-1'));
  });

  it('저장한 draft를 그대로 불러온다', () => {
    const key = getQuizDraftKey(null);
    saveQuizDraft(key, DRAFT);

    expect(loadQuizDraft(key)).toEqual(DRAFT);
  });

  it('저장된 값이 없으면 null을 반환한다', () => {
    expect(loadQuizDraft(getQuizDraftKey(null))).toBeNull();
  });

  it('손상된 JSON이 저장되어 있으면 null을 반환한다', () => {
    const key = getQuizDraftKey(null);
    localStorage.setItem(key, '{invalid-json');

    expect(loadQuizDraft(key)).toBeNull();
  });

  it('필수 필드가 누락되면 null을 반환한다', () => {
    const key = getQuizDraftKey(null);
    localStorage.setItem(key, JSON.stringify({ quizTtl: '제목만 있음' }));

    expect(loadQuizDraft(key)).toBeNull();
  });

  it('clearQuizDraft 호출 후에는 draft를 불러올 수 없다', () => {
    const key = getQuizDraftKey(null);
    saveQuizDraft(key, DRAFT);

    clearQuizDraft(key);

    expect(loadQuizDraft(key)).toBeNull();
  });

  it('새 퀴즈와 수정 화면의 draft는 서로 덮어쓰지 않는다', () => {
    saveQuizDraft(getQuizDraftKey(null), DRAFT);
    saveQuizDraft(getQuizDraftKey('quiz-1'), {
      ...DRAFT,
      quizTtl: '수정 중인 퀴즈',
    });

    expect(loadQuizDraft(getQuizDraftKey(null))?.quizTtl).toBe('내 퀴즈');
    expect(loadQuizDraft(getQuizDraftKey('quiz-1'))?.quizTtl).toBe(
      '수정 중인 퀴즈',
    );
  });
});
