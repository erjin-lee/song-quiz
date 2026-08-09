export interface QuizListItemDto {
  quizId: string;
  quizTtl: string;
  quizDesc: string | null;
  thumbImgUrl: string | null;
  playCnt: number;
}
