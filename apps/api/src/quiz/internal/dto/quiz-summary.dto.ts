export interface QuizSummaryDto {
  quizId: string;
  quizTtl: string;
  quizDesc: string | null;
  thumbImgUrl: string | null;
  songCount: number;
  atstIds: string[];
  atstNms: string[];
}
