// alarm-notifier(apps/lambda/alarm-notifier/src/types.ts)와 동일한 이유로, AWS 공식
// EventBridge "CloudWatch Alarm State Change" 스키마 전체를 옮기지 않고 이 Lambda가
// 실제로 쓰는 필드만 정의한다.
export interface CloudWatchAlarmState {
  value: "OK" | "ALARM" | "INSUFFICIENT_DATA";
  reason: string;
  timestamp: string;
}

export interface CloudWatchAlarmStateChangeDetail {
  alarmName: string;
  state: CloudWatchAlarmState;
}

export interface EventBridgeAlarmStateChangeEvent {
  id: string;
  detail: CloudWatchAlarmStateChangeDetail;
}
