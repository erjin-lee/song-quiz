import { apiDelete, apiGet, apiPatch, apiPost } from './client';
import type {
  AnswerCandidatesDto,
  CreateQuizRequest,
  CreateQuizResultDto,
  DbSongSearchResultDto,
  MelonSongSearchResultDto,
  MyQuizListItemDto,
  QuizEditDetailDto,
  RegisteredSongDto,
  RegistrationEligibilityDto,
  YoutubeLinkValidationResultDto,
} from '../types/quiz-registration';

export function searchDbSongs(
  keyword: string,
): Promise<DbSongSearchResultDto[]> {
  return apiGet<DbSongSearchResultDto[]>(
    `/songs/search?keyword=${encodeURIComponent(keyword)}`,
  );
}

export function searchMelonSongs(
  keyword: string,
): Promise<MelonSongSearchResultDto[]> {
  return apiGet<MelonSongSearchResultDto[]>(
    `/melon/songs/search?keyword=${encodeURIComponent(keyword)}`,
  );
}

export function registerSongFromMelon(
  melonSongId: string,
): Promise<RegisteredSongDto> {
  return apiPost<RegisteredSongDto>('/songs/from-melon', { melonSongId });
}

export function getAnswerCandidates(songId: string): Promise<string[]> {
  return apiGet<AnswerCandidatesDto>(`/songs/${songId}/answers`).then(
    (result) => result.answers,
  );
}

export function validateYoutubeLink(
  songId: string,
  youtubeUrl: string,
): Promise<YoutubeLinkValidationResultDto> {
  return apiPost<YoutubeLinkValidationResultDto>(
    `/songs/${songId}/youtube-link/validate`,
    { youtubeUrl },
  );
}

export function autoFillYoutubeLink(
  songId: string,
): Promise<YoutubeLinkValidationResultDto> {
  return apiPost<YoutubeLinkValidationResultDto>(
    `/songs/${songId}/youtube-link/auto`,
  );
}

export function getRegistrationEligibility(): Promise<RegistrationEligibilityDto> {
  return apiGet<RegistrationEligibilityDto>('/quizzes/registration-eligibility');
}

export function createQuiz(
  dto: CreateQuizRequest,
): Promise<CreateQuizResultDto> {
  return apiPost<CreateQuizResultDto>('/quizzes', dto);
}

export function updateQuiz(
  quizId: string,
  dto: CreateQuizRequest,
): Promise<CreateQuizResultDto> {
  return apiPatch<CreateQuizResultDto>(`/quizzes/${quizId}`, dto);
}

export function deleteQuiz(quizId: string): Promise<void> {
  return apiDelete<void>(`/quizzes/${quizId}`);
}

export function getMyQuizzes(): Promise<MyQuizListItemDto[]> {
  return apiGet<MyQuizListItemDto[]>('/quizzes/mine');
}

export function getQuizForEdit(quizId: string): Promise<QuizEditDetailDto> {
  return apiGet<QuizEditDetailDto>(`/quizzes/${quizId}`);
}
