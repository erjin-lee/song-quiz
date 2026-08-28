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
import { AnalysisWindow, IncidentType } from "./context/types";
import { INCIDENT_POLICIES } from "./context/incident-policy";
import { analyzeIncident } from "./openai/analyze-incident";
import { buildAiAnalysisMessage } from "./slack/build-ai-analysis-message";
import { sendSlackMessage } from "./send-slack-message";
import { getSsmParameter } from "./get-ssm-parameter";

// EventBridge Rule(infra/terraform/modules/aiops/eventbridge.tf)이 이미 정확히 이 두 알람
// 이름 + ALARM 상태로 좁혀 보내지만, alarm-notifier와 동일하게 Lambda 쪽에서도 한 번 더
// 방어적으로 검증한다(§6 - OK/INSUFFICIENT_DATA는 분석하지 않는다, §5 - 다른 Alarm은
// 분석하지 않는다). 새 Alarm을 추가할 때는 IncidentPolicy(context/incident-policy.ts)에
// 항목 하나만 추가한다(§v1-2 최소 공통화) - 아직 지원하지 않는 Alarm은 이 맵에 없으므로
// 자동으로 skip된다.
const INCIDENT_TYPE_BY_ALARM_NAME: Record<string, IncidentType> =
  Object.fromEntries(
    (Object.keys(INCIDENT_POLICIES) as IncidentType[]).map(
      (incidentType): [string, IncidentType] => {
        const policy = INCIDENT_POLICIES[incidentType];
        const alarmName =
          process.env[policy.alarmNameEnvVar] ?? policy.defaultAlarmName;
        return [alarmName, incidentType];
      },
    ),
  );
const ALARM_NAME_PREFIX = "SongQuiz-Prod-";
const ANALYSIS_WINDOW_MINUTES = 15;
const DEFAULT_OPENAI_MODEL = "gpt-5.6-luna";

const GAME_LOG_GROUP_NAME = process.env.GAME_LOG_GROUP_NAME;
// API_TARGET_5XX(§AIOps v1-3)에서만 쓴다 - apps/lambda/CLAUDE.md 규칙대로 findMissingEnv에서
// 이 IncidentType일 때만 필수로 취급해, terraform apply 전에 CI가 코드를 먼저 배포해도
// 기존 두 IncidentType은 계속 동작한다.
const API_LOG_GROUP_NAME = process.env.API_LOG_GROUP_NAME;
const GAME_METRIC_NAMESPACE =
  process.env.GAME_METRIC_NAMESPACE ?? "SongQuiz/Game";
const ALB_ARN_SUFFIX = process.env.ALB_ARN_SUFFIX;
const API_TARGET_GROUP_ARN_SUFFIX = process.env.API_TARGET_GROUP_ARN_SUFFIX;
const GAME_TARGET_GROUP_ARN_SUFFIX = process.env.GAME_TARGET_GROUP_ARN_SUFFIX;
const DB_INSTANCE_IDENTIFIER = process.env.DB_INSTANCE_IDENTIFIER;
// Game Target5xx 분석(EC2/Redis resource pressure 비교, §v1-2)에만 필요한 metric dimension이다.
const EC2_INSTANCE_ID = process.env.EC2_INSTANCE_ID;
const EC2_METRIC_NAMESPACE = process.env.EC2_METRIC_NAMESPACE;
const CACHE_CLUSTER_ID = process.env.CACHE_CLUSTER_ID;
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

/**
 * 필수 환경변수가 하나라도 비어 있으면 AWS API를 호출하기 전에 즉시 실패시킨다.
 * IncidentPolicy.requiredEnv만 검사한다 - API_LOG_GROUP_NAME처럼 IncidentType마다
 * 다른 필수 환경변수도 이 목록에만 반영하면 되고(§AIOps v1-3), 여기서 별도로
 * IncidentType 분기를 두지 않는다.
 */
function findMissingEnv(incidentType: IncidentType): string | null {
  const requiredEnv = INCIDENT_POLICIES[incidentType].requiredEnv;
  return requiredEnv.find((key) => !process.env[key]) ?? null;
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

  const incidentType = alarmName
    ? INCIDENT_TYPE_BY_ALARM_NAME[alarmName]
    : undefined;

  if (!incidentType || state !== "ALARM") {
    console.log(
      JSON.stringify({
        event: "incident_analysis_skipped",
        alarmName: alarmName ?? null,
        state: state ?? null,
        incidentId,
        reason: !incidentType ? "not_target_alarm" : "not_alarm_state",
      }),
    );
    return;
  }

  const missingEnv = findMissingEnv(incidentType);
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
  const policy = INCIDENT_POLICIES[incidentType];

  const [alarmDefinitionResult, metricsResult, logsResult, deploymentsResult] =
    await Promise.all([
      collectAlarmDefinition(alarmName),
      collectMetrics(
        window,
        {
          gameMetricNamespace: GAME_METRIC_NAMESPACE,
          albArnSuffix: ALB_ARN_SUFFIX as string,
          apiTargetGroupArnSuffix: API_TARGET_GROUP_ARN_SUFFIX as string,
          gameTargetGroupArnSuffix: GAME_TARGET_GROUP_ARN_SUFFIX as string,
          dbInstanceIdentifier: DB_INSTANCE_IDENTIFIER as string,
          ec2InstanceId: EC2_INSTANCE_ID as string,
          ec2MetricNamespace: EC2_METRIC_NAMESPACE as string,
          cacheClusterId: CACHE_CLUSTER_ID as string,
        },
        incidentType,
      ),
      collectLogs(
        window,
        {
          gameLogGroupName: GAME_LOG_GROUP_NAME as string,
          apiLogGroupName: API_LOG_GROUP_NAME,
        },
        incidentType,
      ),
      collectDeployments(
        {
          apiDeploymentParameterName: policy.deploymentServices.includes("api")
            ? API_DEPLOYMENT_PARAMETER_NAME
            : undefined,
          gameDeploymentParameterName: policy.deploymentServices.includes(
            "game",
          )
            ? GAME_DEPLOYMENT_PARAMETER_NAME
            : undefined,
        },
        triggeredAt,
      ),
    ]);

  // X-Ray 조회는 로그에서 얻은 traceId에 의존하므로(§14) 로그 수집이 끝난 뒤 이어서 한다.
  // IncidentPolicy.collectsTraces가 false인 IncidentType은 조회 자체를 시도하지 않는다.
  const traceIds = logsResult.logs.samples
    .map((sample) => sample.traceId)
    .filter((traceId): traceId is string => Boolean(traceId));
  const tracesResult = policy.collectsTraces
    ? await collectTraces(traceIds)
    : { status: "success" as const, traces: [] };

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
