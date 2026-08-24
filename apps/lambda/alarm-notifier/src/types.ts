// CloudWatch Alarm State Change EventBridge 이벤트 중 이 Lambda가 실제로 쓰는 필드만 정의한다.
// AWS 공식 스키마 전체를 옮기지 않고, Slack 메시지를 만드는 데 필요한 값만 타입으로 남긴다.
export interface CloudWatchAlarmState {
  value: "OK" | "ALARM" | "INSUFFICIENT_DATA";
  reason: string;
  reasonData?: string;
  timestamp: string;
}

export interface CloudWatchAlarmStateChangeDetail {
  alarmName: string;
  state: CloudWatchAlarmState;
  previousState: CloudWatchAlarmState;
}

export interface EventBridgeAlarmStateChangeEvent {
  version: string;
  id: string;
  "detail-type": string;
  source: string;
  account: string;
  time: string;
  region: string;
  resources: string[];
  detail: CloudWatchAlarmStateChangeDetail;
}
