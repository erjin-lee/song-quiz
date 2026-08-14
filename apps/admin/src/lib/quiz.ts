import { apiGet } from '@/lib/api-client';
import type { QuizListItemDto, QuizSongItemDto } from '@/types/quiz';

export function getQuizzes(): Promise<QuizListItemDto[]> {
  return apiGet<QuizListItemDto[]>('/quizzes');
}

export function getQuizSongs(quizId: string): Promise<QuizSongItemDto[]> {
  return apiGet<QuizSongItemDto[]>(`/quizzes/${quizId}/songs`);
}
