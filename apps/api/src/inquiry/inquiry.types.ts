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

/**
 * 승인/반려를 실행한 관리자. Slack 인터랙션(apps/api/src/slack)도 SQ_USER_SLACK으로
 * 실제 관리자 userKey를 해석한 뒤 이 타입 그대로 AdminService.approveInquiry/
 * rejectInquiry를 호출한다 - REVIEWED_VIA는 Slack 경유 여부와 무관하게 항상 'ADMIN'으로
 * 기록된다(ADR-0008 참고, "기존 관리자 API를 그대로 재사용" 결정).
 */
export interface InquiryReviewActor {
  userKey: string;
}

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
