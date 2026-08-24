import { EventBridgeAlarmStateChangeEvent } from "./types";
import { parseAlarmName } from "./parse-alarm-name";
import { buildSlackMessage } from "./build-slack-message";
import { getSlackWebhookUrl } from "./get-slack-webhook-url";
import { sendSlackMessage } from "./send-slack-message";

const ALARM_NAME_PREFIX = process.env.ALARM_NAME_PREFIX ?? "SongQuiz-Prod-";
const SLACK_WEBHOOK_PARAMETER_NAME = process.env.SLACK_WEBHOOK_PARAMETER_NAME;

// EventBridge Rule(infra/terraform/modules/notification/eventbridge.tf)이 이미
// source/detail-type/state(ALARM|OK)/alarmName prefix로 필터링하지만, Lambda 쪽에서도
// 한 번 더 방어적으로 검증한다 - 이벤트 전체(console.log(event))는 절대 로그로 남기지 않는다.
export async function handler(
  event: EventBridgeAlarmStateChangeEvent,
): Promise<void> {
  const detail = event.detail;
  const alarmName = detail?.alarmName;
  const state = detail?.state?.value;

  if (!alarmName || !alarmName.startsWith(ALARM_NAME_PREFIX)) {
    console.log(
      JSON.stringify({
        event: "alarm_notification_skipped",
        alarmName: alarmName ?? null,
        reason: "not_song_quiz_alarm",
      }),
    );
    return;
  }

  if (state !== "ALARM" && state !== "OK") {
    console.log(
      JSON.stringify({
        event: "alarm_notification_skipped",
        alarmName,
        state,
        reason: "unsupported_state",
      }),
    );
    return;
  }

  if (!SLACK_WEBHOOK_PARAMETER_NAME) {
    throw new Error(
      "SLACK_WEBHOOK_PARAMETER_NAME environment variable is not set",
    );
  }

  const parsed = parseAlarmName(alarmName, ALARM_NAME_PREFIX);
  const message = buildSlackMessage(detail, parsed);

  try {
    const webhookUrl = await getSlackWebhookUrl(SLACK_WEBHOOK_PARAMETER_NAME);
    await sendSlackMessage(webhookUrl, message);
  } catch (error) {
    console.error(
      JSON.stringify({ event: "alarm_notification_failed", alarmName, state }),
    );
    throw error;
  }

  console.log(
    JSON.stringify({
      event: "alarm_notification_sent",
      alarmName,
      state,
      service: parsed?.service ?? null,
      severity: parsed?.severity ?? null,
    }),
  );
}
