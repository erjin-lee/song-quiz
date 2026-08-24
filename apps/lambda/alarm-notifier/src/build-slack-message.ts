import { CloudWatchAlarmStateChangeDetail } from "./types";
import { ParsedAlarmName } from "./parse-alarm-name";
import { formatKst } from "./format-time";
import { formatDuration } from "./format-duration";

const REASON_MAX_LENGTH = 300;

export interface SlackMessage {
  text: string;
  blocks: unknown[];
}

function truncate(text: string, maxLength: number): string {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength)}…`;
}

// 파싱된 severity/service/signal이 없어도(naming convention을 벗어난 Alarm) Alarm Name/State/
// Reason/Time만으로 최소한의 메시지를 만든다 - Lambda 전체가 죽지 않도록 하는 것이 우선이다.
export function buildSlackMessage(
  detail: CloudWatchAlarmStateChangeDetail,
  parsed: ParsedAlarmName | null,
): SlackMessage {
  const isAlarm = detail.state.value === "ALARM";

  const severityLabel = parsed?.severity.toUpperCase() ?? "UNKNOWN";
  const serviceLabel = parsed?.service ?? "Unknown";
  const signalLabel = parsed?.signal ?? "Unknown";

  const headerText = isAlarm
    ? `🚨 [${severityLabel}] ${serviceLabel} Alarm`
    : `✅ [RECOVERED] ${serviceLabel} Alarm`;

  const fields = [
    { type: "mrkdwn", text: `*Alarm*\n${detail.alarmName}` },
    { type: "mrkdwn", text: `*Service*\n${serviceLabel}` },
    { type: "mrkdwn", text: `*Signal*\n${signalLabel}` },
    {
      type: "mrkdwn",
      text: `*State*\n${detail.previousState.value} → ${detail.state.value}`,
    },
  ];

  // 장애 지속 시간은 실제로 ALARM -> OK로 복구된 경우에만 의미가 있다. previousState가
  // INSUFFICIENT_DATA -> OK 같은 전이면 "장애 지속 시간"이라는 라벨과 맞지 않아 표시하지 않는다.
  if (!isAlarm && detail.previousState.value === "ALARM") {
    fields.push({
      type: "mrkdwn",
      text: `*Duration*\n${formatDuration(detail.previousState.timestamp, detail.state.timestamp)}`,
    });
  }

  const blocks: unknown[] = [
    {
      type: "header",
      text: { type: "plain_text", text: headerText, emoji: true },
    },
    { type: "section", fields },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Reason*\n${truncate(detail.state.reason, REASON_MAX_LENGTH)}`,
      },
    },
    {
      type: "context",
      elements: [
        { type: "mrkdwn", text: `Time: ${formatKst(detail.state.timestamp)}` },
      ],
    },
  ];

  return { text: headerText, blocks };
}
