import { EventBridgeAlarmStateChangeEvent } from "./types";
import { parseAlarmName } from "./parse-alarm-name";
import { buildSlackMessage, RecoveryConfirmation } from "./build-slack-message";
import { getSlackWebhookUrl } from "./get-slack-webhook-url";
import { sendSlackMessage } from "./send-slack-message";
import { getRecentSuccessCount } from "./get-recent-success-count";

const ALARM_NAME_PREFIX = process.env.ALARM_NAME_PREFIX ?? "SongQuiz-Prod-";
const SLACK_WEBHOOK_PARAMETER_NAME = process.env.SLACK_WEBHOOK_PARAMETER_NAME;

// RECOVERY_CONFIRM_* 4개는 modules/notification/lambda.tf가 함께 주입한다. GAME_METRIC_NAMESPACE가
// 없으면(로컬 테스트 등) 복구 확인 자체를 건너뛰고 기존처럼 즉시 RECOVERED를 보낸다.
const GAME_METRIC_NAMESPACE = process.env.GAME_METRIC_NAMESPACE;
const RECOVERY_CONFIRM_ALARM_SIGNAL =
  process.env.RECOVERY_CONFIRM_ALARM_SIGNAL ?? "QuizSnapshotFailure";
const RECOVERY_CONFIRM_METRIC_NAME =
  process.env.RECOVERY_CONFIRM_METRIC_NAME ?? "GameStartSuccess";
const RECOVERY_CONFIRM_MIN_COUNT = Number(
  process.env.RECOVERY_CONFIRM_MIN_COUNT ?? "5",
);
const RECOVERY_CONFIRM_LOOKBACK_MINUTES = Number(
  process.env.RECOVERY_CONFIRM_LOOKBACK_MINUTES ?? "10",
);

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

  // RECOVERY_CONFIRM_ALARM_SIGNAL(기본 QuizSnapshotFailure)가 실제로 ALARM -> OK로 복구된
  // 경우에만, GameStartSuccess 지표로 최근 게임 시작이 RECOVERY_CONFIRM_MIN_COUNT회 이상
  // 성공했는지 확인한다. 부족하면 RECOVERED 알림을 이번 전이에서는 보내지 않는다 - 실패가
  // 잠깐 멈춘 것만으로 복구를 단정하지 않고, 실사용 트래픽이 실제로 정상 흐르는지까지 본다.
  let recoveryConfirmation: RecoveryConfirmation | undefined;

  if (
    state === "OK" &&
    detail.previousState.value === "ALARM" &&
    parsed?.signal === RECOVERY_CONFIRM_ALARM_SIGNAL &&
    GAME_METRIC_NAMESPACE
  ) {
    let successCount: number | null = null;
    try {
      successCount = await getRecentSuccessCount(
        GAME_METRIC_NAMESPACE,
        RECOVERY_CONFIRM_METRIC_NAME,
        RECOVERY_CONFIRM_LOOKBACK_MINUTES,
      );
    } catch {
      // 지표 조회 자체가 실패하면 복구 확인을 못 했다고 알림을 계속 막는 것보다, 기존 동작대로
      // 즉시 RECOVERED를 보내는 쪽(fail open)이 낫다 - 우리 쪽 오류로 실제 복구 알림을 영영
      // 놓치는 것을 피한다.
      console.error(
        JSON.stringify({
          event: "recovery_confirmation_check_failed",
          alarmName,
        }),
      );
    }

    if (successCount !== null && successCount < RECOVERY_CONFIRM_MIN_COUNT) {
      console.log(
        JSON.stringify({
          event: "alarm_notification_skipped",
          alarmName,
          state,
          reason: "recovery_not_confirmed",
          successCount,
          requiredCount: RECOVERY_CONFIRM_MIN_COUNT,
        }),
      );
      return;
    }

    // successCount가 null이면(지표 조회 실패, fail open) 실제로 확인된 값이 없으니 메시지에도
    // 성공 횟수를 표시하지 않는다 - 확인 안 된 값을 확인된 것처럼 보여주지 않기 위함.
    if (successCount !== null) {
      recoveryConfirmation = {
        successCount,
        minCount: RECOVERY_CONFIRM_MIN_COUNT,
        lookbackMinutes: RECOVERY_CONFIRM_LOOKBACK_MINUTES,
      };
    }
  }

  const message = buildSlackMessage(detail, parsed, recoveryConfirmation);

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
