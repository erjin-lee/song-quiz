import { apiGet } from './client';
import type { QuizListItemDto } from '../types/quiz';

interface QuizSongCountDto {
  count: number;
}

export function getQuizzes(): Promise<QuizListItemDto[]> {
  return apiGet<QuizListItemDto[]>('/quizzes');
}

export async function getQuizSongCount(quizId: string): Promise<number> {
  const result = await apiGet<QuizSongCountDto>(
    `/quizzes/${quizId}/songs/count`,
  );
  return result.count;
}
