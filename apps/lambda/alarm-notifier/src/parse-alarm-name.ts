// Alarm naming convention: SongQuiz-Prod-{Severity}-{Service}-{Signal}
// (infra/terraform/modules/monitoring/alarms.tf 참고). CloudWatch Alarm State Change 이벤트에는
// tag가 포함되지 않아(EventBridge가 별도 조회를 하지 않는 한) 이름을 파싱하는 것 외에 안정적인
// metadata 소스가 없다. prefix를 뗀 나머지를 "-"로 쪼개는 단순한 문자열 처리만 하고, 형식이
// 안 맞으면 정규식으로 억지로 맞추려 하지 않고 그냥 null을 돌려준다 - 호출부(handler.ts)가
// null이어도 Alarm Name/State/Reason/Time만으로 최소한의 Slack 메시지를 만들 수 있어야 한다.
export interface ParsedAlarmName {
  severity: string;
  service: string;
  signal: string;
}

export function parseAlarmName(
  alarmName: string,
  prefix: string,
): ParsedAlarmName | null {
  if (!alarmName.startsWith(prefix)) {
    return null;
  }

  const rest = alarmName.slice(prefix.length); // 예: "High-Game-Target5xx"
  const parts = rest.split("-").filter((part) => part.length > 0);
  if (parts.length < 3) {
    return null;
  }

  const [severity, service, ...signalParts] = parts;
  return { severity, service, signal: signalParts.join("-") };
}
