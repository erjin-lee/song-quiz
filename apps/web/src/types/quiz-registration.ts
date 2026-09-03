/** apps/api의 로그인 유저 퀴즈 등록 관련 DTO 미러링(ADR-0003). */

export interface DbSongSearchResultDto {
  songId: string;
  songNm: string;
  atstNm: string;
  displayLabel: string;
  ytbLink: string | null;
}

export interface MelonArtistBriefDto {
  melonArtistId: string;
  atstNm: string;
}

export interface MelonSongSearchResultDto {
  melonSongId: string;
  songNm: string;
  melonAlbmId: string;
  albmNm: string;
  artists: MelonArtistBriefDto[];
  displayLabel: string;
}

export interface RegisteredSongDto {
  songId: string;
  songNm: string;
  ytbLink: string | null;
}

export interface YoutubeLinkValidationResultDto {
  valid: boolean;
  youtubeUrl: string | null;
  youtubeVideoId: string | null;
  durationSec: number | null;
  startSec: number | null;
  endSec: number | null;
  reason: string | null;
  verificationToken: string | null;
}

export interface AnswerCandidatesDto {
  answers: string[];
}

export interface RegistrationEligibilityDto {
  eligible: boolean;
  remainingSeconds: number;
}

export interface CreateQuizSongInput {
  songId: string;
  youtubeUrl: string;
  answers: string[];
  verificationToken: string;
}

export interface CreateQuizRequest {
  quizTtl: string;
  quizDesc?: string;
  songs: CreateQuizSongInput[];
}

export interface CreateQuizResultDto {
  quizId: string;
}

export interface MyQuizListItemDto {
  quizId: string;
  quizTtl: string;
  quizDesc: string | null;
  songCount: number;
  playCnt: number;
  crtDt: string;
}

export interface QuizEditSongItemDto {
  songId: string;
  songNm: string;
  atstNm: string;
  youtubeUrl: string;
  answers: string[];
  verificationToken: string | null;
  failReason: string | null;
}

export interface QuizEditDetailDto {
  quizId: string;
  quizTtl: string;
  quizDesc: string | null;
  songs: QuizEditSongItemDto[];
}
