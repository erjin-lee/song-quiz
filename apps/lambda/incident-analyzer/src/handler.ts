import { EventBridgeAlarmStateChangeEvent } from "./types";
import { parseAlarmName } from "./parse-alarm-name";
import { collectAlarmDefinition } from "./context/collect-alarm-definition";
import { collectMetrics } from "./context/collect-metrics";
import { collectLogs } from "./context/collect-logs";
import { collectTraces } from "./context/collect-traces";
import { collectDeployments } from "./context/collect-deployments";
import {
  buildIncidentContext,
  hasSufficientContext,
} from "./context/build-incident-context";
import { AnalysisWindow } from "./context/types";
import { analyzeIncident } from "./openai/analyze-incident";
import { buildAiAnalysisMessage } from "./slack/build-ai-analysis-message";
import { sendSlackMessage } from "./send-slack-message";
import { getSsmParameter } from "./get-ssm-parameter";

// EventBridge Rule(infra/terraform/modules/aiops/eventbridge.tf)이 이미 정확히 이 알람
// 이름 + ALARM 상태로 좁혀 보내지만, alarm-notifier와 동일하게 Lambda 쪽에서도 한 번 더
// 방어적으로 검증한다(§6 - OK/INSUFFICIENT_DATA는 분석하지 않는다, §5 - 다른 Alarm은
// 분석하지 않는다).
const TARGET_ALARM_NAME =
  process.env.TARGET_ALARM_NAME ??
  "SongQuiz-Prod-High-Game-QuizSnapshotFailure";
const ALARM_NAME_PREFIX = "SongQuiz-Prod-";
const ANALYSIS_WINDOW_MINUTES = 15;
const DEFAULT_OPENAI_MODEL = "gpt-5.6-luna";

const GAME_LOG_GROUP_NAME = process.env.GAME_LOG_GROUP_NAME;
const GAME_METRIC_NAMESPACE =
  process.env.GAME_METRIC_NAMESPACE ?? "SongQuiz/Game";
const ALB_ARN_SUFFIX = process.env.ALB_ARN_SUFFIX;
const API_TARGET_GROUP_ARN_SUFFIX = process.env.API_TARGET_GROUP_ARN_SUFFIX;
const GAME_TARGET_GROUP_ARN_SUFFIX = process.env.GAME_TARGET_GROUP_ARN_SUFFIX;
const DB_INSTANCE_IDENTIFIER = process.env.DB_INSTANCE_IDENTIFIER;
const SLACK_WEBHOOK_PARAMETER_NAME = process.env.SLACK_WEBHOOK_PARAMETER_NAME;
const OPENAI_API_KEY_PARAMETER_NAME = process.env.OPENAI_API_KEY_PARAMETER_NAME;
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL;
// Deployment Context는 보조 근거라 필수 환경변수로 취급하지 않는다(§29) - 설정 안 돼
// 있거나 아직 SSM에 기록된 적 없어도 나머지 분석은 그대로 진행한다.
const API_DEPLOYMENT_PARAMETER_NAME = process.env.API_DEPLOYMENT_PARAMETER_NAME;
const GAME_DEPLOYMENT_PARAMETER_NAME =
  process.env.GAME_DEPLOYMENT_PARAMETER_NAME;

function buildAnalysisWindow(triggeredAt: Date): AnalysisWindow {
  return {
    startTime: new Date(
      triggeredAt.getTime() - ANALYSIS_WINDOW_MINUTES * 60_000,
    ),
    endTime: triggeredAt,
  };
}

/** 필수 환경변수가 하나라도 비어 있으면 AWS API를 호출하기 전에 즉시 실패시킨다. */
function findMissingEnv(): string | null {
  const required: Record<string, string | undefined> = {
    GAME_LOG_GROUP_NAME,
    ALB_ARN_SUFFIX,
    API_TARGET_GROUP_ARN_SUFFIX,
    GAME_TARGET_GROUP_ARN_SUFFIX,
    DB_INSTANCE_IDENTIFIER,
    SLACK_WEBHOOK_PARAMETER_NAME,
    OPENAI_API_KEY_PARAMETER_NAME,
  };
  const missing = Object.entries(required).find(([, value]) => !value);
  return missing ? missing[0] : null;
}

export async function handler(
  event: EventBridgeAlarmStateChangeEvent,
): Promise<void> {
  const detail = event.detail;
  const alarmName = detail?.alarmName;
  const state = detail?.state?.value;
  // incidentId는 EventBridge event.id를 우선 쓴다(§30) - 재전달(at-least-once)되어도
  // 같은 값이라 로그로 중복 실행 여부를 추적할 수 있다.
  const incidentId =
    event.id ??
    `${alarmName ?? "unknown"}-${detail?.state?.timestamp ?? "unknown"}`;

  if (alarmName !== TARGET_ALARM_NAME || state !== "ALARM") {
    console.log(
      JSON.stringify({
        event: "incident_analysis_skipped",
        alarmName: alarmName ?? null,
        state: state ?? null,
        incidentId,
        reason:
          alarmName !== TARGET_ALARM_NAME
            ? "not_target_alarm"
            : "not_alarm_state",
      }),
    );
    return;
  }

  const missingEnv = findMissingEnv();
  if (missingEnv) {
    console.error(
      JSON.stringify({
        event: "incident_analysis_failed",
        stage: "config",
        incidentId,
        missingEnv,
      }),
    );
    return;
  }

  console.log(
    JSON.stringify({
      event: "incident_analysis_started",
      alarmName,
      incidentId,
    }),
  );

  const parsed = parseAlarmName(alarmName, ALARM_NAME_PREFIX);
  const triggeredAt = new Date(detail.state.timestamp);
  const window = buildAnalysisWindow(triggeredAt);

  const [alarmDefinitionResult, metricsResult, logsResult, deploymentsResult] =
    await Promise.all([
      collectAlarmDefinition(alarmName),
      collectMetrics(window, {
        gameMetricNamespace: GAME_METRIC_NAMESPACE,
        albArnSuffix: ALB_ARN_SUFFIX as string,
        apiTargetGroupArnSuffix: API_TARGET_GROUP_ARN_SUFFIX as string,
        gameTargetGroupArnSuffix: GAME_TARGET_GROUP_ARN_SUFFIX as string,
        dbInstanceIdentifier: DB_INSTANCE_IDENTIFIER as string,
      }),
      collectLogs(window, { gameLogGroupName: GAME_LOG_GROUP_NAME as string }),
      collectDeployments(
        {
          apiDeploymentParameterName: API_DEPLOYMENT_PARAMETER_NAME,
          gameDeploymentParameterName: GAME_DEPLOYMENT_PARAMETER_NAME,
        },
        triggeredAt,
      ),
    ]);

  // X-Ray 조회는 로그에서 얻은 traceId에 의존하므로(§14) 로그 수집이 끝난 뒤 이어서 한다.
  const traceIds = logsResult.logs.samples
    .map((sample) => sample.traceId)
    .filter((traceId): traceId is string => Boolean(traceId));
  const tracesResult = await collectTraces(traceIds);

  console.log(
    JSON.stringify({
      event: "incident_context_collected",
      incidentId,
      metricCount: metricsResult.metrics.length,
      logSampleCount: logsResult.logs.samples.length,
      traceCount: tracesResult.traces.length,
      deploymentCount: deploymentsResult.deployments.length,
      collection: {
        alarmDefinition: alarmDefinitionResult.status,
        metrics: metricsResult.status,
        logs: logsResult.status,
        traces: tracesResult.status,
        deployments: deploymentsResult.status,
      },
    }),
  );

  const context = buildIncidentContext(
    {
      name: alarmName,
      service: parsed?.service ?? "Game",
      severity: parsed?.severity ?? "High",
      signal: parsed?.signal ?? "QuizSnapshotFailure",
      triggeredAt: detail.state.timestamp,
      reason: detail.state.reason,
    },
    alarmDefinitionResult,
    metricsResult,
    logsResult,
    tracesResult,
    deploymentsResult,
  );

  // 핵심 데이터(Metrics/Logs)가 모두 실패하면 OpenAI를 호출하지 않는다(§16).
  if (!hasSufficientContext(context)) {
    console.error(
      JSON.stringify({
        event: "incident_analysis_failed",
        stage: "context_collection",
        incidentId,
      }),
    );
    return;
  }

  let analysis;
  try {
    const apiKey = await getSsmParameter(
      OPENAI_API_KEY_PARAMETER_NAME as string,
    );
    analysis = await analyzeIncident(context, { apiKey, model: OPENAI_MODEL });
  } catch {
    // OpenAI 실패는 기존 alarm-notifier의 즉시 알림에 영향을 주지 않는다(§2, §17) -
    // 이 Lambda는 별도 EventBridge target으로 독립 실행되므로 여기서 실패해도 조용히
    // 종료한다(재시도로 인한 중복 Slack 메시지를 피하기 위해 다시 throw하지 않는다).
    console.error(
      JSON.stringify({
        event: "incident_analysis_failed",
        stage: "openai",
        incidentId,
      }),
    );
    return;
  }

  try {
    const webhookUrl = await getSsmParameter(
      SLACK_WEBHOOK_PARAMETER_NAME as string,
    );
    const message = buildAiAnalysisMessage(
      alarmName,
      context.alarm.service,
      analysis,
      context.deployments,
    );
    await sendSlackMessage(webhookUrl, message);
  } catch {
    console.error(
      JSON.stringify({
        event: "incident_analysis_failed",
        stage: "slack",
        incidentId,
      }),
    );
    return;
  }

  console.log(
    JSON.stringify({
      event: "incident_analysis_completed",
      incidentId,
      confidence: analysis.confidence,
    }),
  );
}
