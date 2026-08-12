export type InquiryStatus =
  'RECEIVED' | 'NO_MATCH' | 'REJECTED' | 'COMPLETED' | 'FAILED';

export type InquiryConfidence = 'LOW' | 'MEDIUM' | 'HIGH';

export const INQUIRY_FUNCTION_NAMES = [
  'CHANGE_START_TIME',
  'CHANGE_LINK',
  'ADD_ANSWER',
] as const;

export type InquiryFunctionName = (typeof INQUIRY_FUNCTION_NAMES)[number];

export interface ChangeStartTimeArgs {
  startSec: number;
}

export interface ChangeLinkArgs {
  youtubeUrl: string;
}

export interface AddAnswerArgs {
  answerTxt: string;
  answerType: string | null;
}

export type InquiryFunctionArgsMap = {
  CHANGE_START_TIME: ChangeStartTimeArgs;
  CHANGE_LINK: ChangeLinkArgs;
  ADD_ANSWER: AddAnswerArgs;
};
