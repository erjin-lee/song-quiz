export interface QuizRoundDataDto {
  quizSongId: string;
  youtubeVideoId: string | null;
  startSec: number | null;
  endSec: number | null;
  songNm: string;
  atstNm: string;
  albmNm: string;
  answers: string[];
}
