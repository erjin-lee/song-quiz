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

  // "복구됨" 알림은 실제로 ALARM에서 벗어난 경우에만 보낸다.
  //
  // 새 CloudWatch Alarm은 INSUFFICIENT_DATA 상태로 생성된 뒤 곧바로 평가되는데, 이 프로젝트의
  // Alarm은 전부 treat_missing_data = notBreaching이라 지표가 한 번도 발행되지 않았어도 그대로
  // OK로 전이된다. EventBridge Rule은 "새 상태"가 OK인지만 보고 previousState는 보지 않으므로
  // (modules/notification/eventbridge.tf), 이 전이도 그대로 여기까지 전달된다. 막지 않으면
  // Alarm을 새로 만들 때마다 장애가 난 적도 없는데 "✅ [복구됨]"이 Slack에 올라가고, 그러면
  // 복구 알림 자체를 신뢰할 수 없게 된다.
  //
  // 이 경로가 지금까지 문제되지 않은 이유는 Alarm 1차 세트(#83)가 이 Lambda(#84)보다 먼저
  // 만들어졌기 때문이다. 이후 Alarm을 새로 추가하면 곧바로 발생한다.
  //
  // 부수적으로 ALARM -> INSUFFICIENT_DATA -> OK 경로의 복구 알림도 함께 막히지만, 위와 같은
  // 이유로 notBreaching인 Alarm은 데이터가 없을 때 INSUFFICIENT_DATA가 아니라 OK로 가므로
  // 실제로 이 경로를 타기 어렵다. 반대로 이 검사를 느슨하게 하면 허위 복구 알림이 되살아난다.
  if (state === "OK" && detail.previousState?.value !== "ALARM") {
    console.log(
      JSON.stringify({
        event: "alarm_notification_skipped",
        alarmName,
        state,
        previousState: detail.previousState?.value ?? null,
        reason: "not_recovered_from_alarm",
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
