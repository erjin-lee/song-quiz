export const INQUIRY_CONTENT_MAX_LENGTH = 300;

export interface SubmitInquiryRequestDto {
  quizSongId: string;
  roomId: string;
  userId: string;
  content: string;
}

export interface SubmitInquiryResponseDto {
  inquiryId: string;
  message: string;
}
