// alarm-notifier(apps/lambda/alarm-notifier/src/parse-alarm-name.ts)와 동일한 naming
// convention(SongQuiz-Prod-{Severity}-{Service}-{Signal})을 그대로 따른다. 두 Lambda는
// 서로 import하지 않으므로(§17 - Lambda가 다른 앱/Lambda 코드를 import하지 않는다는
// 원칙을 여기서도 지킨다) 이 작은 유틸을 각자 갖는다.
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

  const rest = alarmName.slice(prefix.length);
  const parts = rest.split("-").filter((part) => part.length > 0);
  if (parts.length < 3) {
    return null;
  }

  const [severity, service, ...signalParts] = parts;
  return { severity, service, signal: signalParts.join("-") };
}
