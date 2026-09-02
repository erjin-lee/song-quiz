/** 지금까지 정의된 알림 종류. 새 기능이 알림을 추가할 때마다 여기에 값을 늘린다. */
export enum NotificationType {
  /** 유저 등록 퀴즈의 최종 등록 처리가 끝났을 때(일부 곡 제외 여부와 무관하게 발송) */
  QUIZ_REG_COMPLETED = 'QUIZ_REG_COMPLETED',
}

/** 목록 조회 시 최대로 내려주는 알림 개수(최신순). */
export const NOTIFICATION_LIST_LIMIT = 50;
