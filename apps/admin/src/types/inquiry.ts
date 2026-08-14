export type InquiryStatus =
  | 'RECEIVED'
  | 'NO_MATCH'
  | 'REJECTED'
  | 'PENDING_REVIEW'
  | 'COMPLETED'
  | 'FAILED';

export type InquiryConfidence = 'LOW' | 'MEDIUM' | 'HIGH';

export type InquiryFunctionName =
  | 'CHANGE_START_TIME'
  | 'CHANGE_LINK'
  | 'ADD_ANSWER';

export interface AdminInquiryItemDto {
  inquiryId: string;
  quizSongId: string;
  songNm: string | null;
  atstNm: string | null;
  youtubeUrl: string | null;
  roomId: string;
  userId: string;
  content: string;
  matchedFunction: InquiryFunctionName | null;
  matchedArgs: Record<string, unknown> | null;
  confidence: InquiryConfidence | null;
  status: InquiryStatus;
  resultMessage: string | null;
  crtDt: string;
}
