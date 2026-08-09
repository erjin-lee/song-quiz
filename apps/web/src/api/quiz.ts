import { apiGet } from './client';
import type { QuizListItemDto } from '../types/quiz';

interface QuizSongItemDto {
  quizSongId: string;
}

export function getQuizzes(): Promise<QuizListItemDto[]> {
  return apiGet<QuizListItemDto[]>('/quizzes');
}

export async function getQuizSongCount(quizId: string): Promise<number> {
  const songs = await apiGet<QuizSongItemDto[]>(`/quizzes/${quizId}/songs`);
  return songs.length;
}
