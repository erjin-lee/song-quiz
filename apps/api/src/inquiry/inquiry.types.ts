export type InquiryStatus =
  | 'RECEIVED'
  | 'NO_MATCH'
  | 'REJECTED'
  | 'PENDING_REVIEW'
  | 'COMPLETED'
  | 'FAILED';

export type InquiryConfidence = 'LOW' | 'MEDIUM' | 'HIGH';

/** SQ_INQUIRY_ACTION.STATUS. EVENT_TYPE(SQ_INQUIRY_ACTION_LOG)도 별도 vocabulary 없이 이 값을 그대로 재사용한다. */
export type InquiryActionStatus =
  | 'PROPOSED'
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXECUTING'
  | 'COMPLETED'
  | 'FAILED';

/** SQ_INQUIRY_ACTION_LOG.SOURCE */
export type InquiryActionLogSource = 'AI' | 'ADMIN' | 'SLACK' | 'SYSTEM';

/** SQ_INQUIRY_ACTION.REVIEWED_VIA */
export type InquiryReviewedVia = 'ADMIN' | 'SLACK';

/** 승인/반려를 실행한 주체. Slack 인터랙션 엔드포인트(후속 작업)도 이 타입을 그대로 쓴다. */
export type InquiryReviewActor =
  | { via: 'ADMIN'; userKey: string }
  | { via: 'SLACK'; slackTeamId: string; slackUserId: string };

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
