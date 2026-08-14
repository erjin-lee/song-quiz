export interface QuizListItemDto {
  quizId: string;
  quizTtl: string;
  quizDesc: string | null;
  thumbImgUrl: string | null;
  playCnt: number;
}

export interface QuizAnswerItemDto {
  quizAnswerId: string;
  quizSongId: string;
  answerTxt: string;
}

export interface QuizSongItemDto {
  quizSongId: string;
  quizSeq: number;
  songId: string;
  songNm: string;
  atstNm: string;
  albmNm: string;
  youtubeUrl: string;
  youtubeVideoId: string | null;
  startSec: number | null;
  endSec: number | null;
  answers: QuizAnswerItemDto[];
}
