import { IncidentType } from "./types";

// collect-logs.ts가 조회할 Log Group 종류(§AIOps v1-3 - 범용 Log Plugin Framework는
// 만들지 않고, IncidentPolicy의 필드 하나로만 game/api를 고른다).
export type LogSource = "game" | "api";

export type DeploymentServiceName = "api" | "game";

/**
 * IncidentType별로 흩어져 있던 "무엇을 어떻게 수집할지" 정책을 한 곳에 모은다(§v1-2 최소
 * 공통화 원칙을 그대로 유지) - 범용 Policy Engine/YAML/Plugin framework가 아니라
 * TypeScript 타입 + 상수 맵이다. 새 IncidentType을 추가할 때는 아래 INCIDENT_POLICIES에
 * 항목 하나만 추가하면 된다(handler.ts/collect-metrics.ts/collect-logs.ts는 이 맵을
 * 조회하기만 하고 IncidentType별로 분기하지 않는다).
 */
export interface IncidentPolicy {
  /** 이 IncidentType의 Alarm 이름을 오버라이드할 수 있는 환경변수 이름(방어적 재검증용). */
  alarmNameEnvVar: string;
  /** 환경변수가 없을 때 쓰는 기본 Alarm 이름. */
  defaultAlarmName: string;
  /** collect-metrics.ts가 조회할 metric 이름 목록 - 순서가 곧 GetMetricData 응답/summary 순서다. */
  metricNames: readonly string[];
  /** collect-logs.ts가 Logs Insights를 조회할 Log Group(game/api). */
  logSource: LogSource;
  /** handler.ts의 findMissingEnv가 검사할, 이 IncidentType에 필요한 환경변수 이름 전체 목록. */
  requiredEnv: readonly string[];
  /** X-Ray Trace 수집 여부. */
  collectsTraces: boolean;
  /** collect-deployments.ts가 조회할 Production Deployment 대상 서비스. */
  deploymentServices: readonly DeploymentServiceName[];
}

// 세 IncidentType 모두 현재 동일한 공통 환경변수 집합을 필요로 한다(EC2_INSTANCE_ID 등
// QUIZ_SNAPSHOT_FAILURE가 실제로 쓰지 않는 값도 같은 Lambda/환경변수 집합을 공유하므로
// 필수로 취급한다 - README "환경 변수" 절 참고). API_TARGET_5XX만 API_LOG_GROUP_NAME이 추가로 필요하다.
const COMMON_REQUIRED_ENV = [
  "GAME_LOG_GROUP_NAME",
  "ALB_ARN_SUFFIX",
  "API_TARGET_GROUP_ARN_SUFFIX",
  "GAME_TARGET_GROUP_ARN_SUFFIX",
  "DB_INSTANCE_IDENTIFIER",
  "EC2_INSTANCE_ID",
  "EC2_METRIC_NAMESPACE",
  "CACHE_CLUSTER_ID",
  "SLACK_WEBHOOK_PARAMETER_NAME",
  "OPENAI_API_KEY_PARAMETER_NAME",
] as const;

// QuizSnapshotFailure(최초 구현(v1) 7개 + room 분산 락 Redis 장애 내성 이벤트 3종)/Game
// Target5xx(v1-2 요청받은 16개 + lock 3종 = 19개)/API Target5xx(v1-3 요청받은 13개 + lock
// 3종 = 16개) 모두, 게임 시작·API/Game 5xx 어느 Alarm으로 들어오든 room lock 경합/lease
// 만료를 같은 보조 근거로 볼 수 있도록 RedisLockRenewFailure/RoomLockLeaseLost/
// StaleFencingWriteRejected 3종을 공통으로 포함한다(단, lock 이상 자체가 직접 원인이라는
// 의미는 아니다). 여기 나열한 순서가 GetMetricData 응답/summary 순서가 된다.
export const INCIDENT_POLICIES: Record<IncidentType, IncidentPolicy> = {
  QUIZ_SNAPSHOT_FAILURE: {
    alarmNameEnvVar: "QUIZ_SNAPSHOT_FAILURE_ALARM_NAME",
    defaultAlarmName: "SongQuiz-Prod-High-Game-QuizSnapshotFailure",
    metricNames: [
      "Game.QuizSnapshotFailure",
      "Game.RedisLockRenewFailure",
      "Game.RoomLockLeaseLost",
      "Game.StaleFencingWriteRejected",
      "API.HTTPCode_Target_5XX_Count",
      "API.TargetResponseTime",
      "Game.HTTPCode_Target_5XX_Count",
      "Game.TargetResponseTime",
      "RDS.CPUUtilization",
      "RDS.DatabaseConnections",
    ],
    logSource: "game",
    requiredEnv: COMMON_REQUIRED_ENV,
    collectsTraces: true,
    deploymentServices: ["api", "game"],
  },
  GAME_TARGET_5XX: {
    alarmNameEnvVar: "GAME_TARGET_5XX_ALARM_NAME",
    defaultAlarmName: "SongQuiz-Prod-High-Game-Target5xx",
    metricNames: [
      "Game.HTTPCode_Target_5XX_Count",
      "Game.TargetResponseTime",
      "Game.RequestCount",
      "API.HTTPCode_Target_5XX_Count",
      "API.TargetResponseTime",
      "API.RequestCount",
      "Game.QuizSnapshotFailure",
      "Game.RedisLockFailure",
      "Game.TimerClaimFailure",
      "Game.RedisLockRenewFailure",
      "Game.RoomLockLeaseLost",
      "Game.StaleFencingWriteRejected",
      "EC2.CPUUtilization",
      "EC2.MemoryUsedPercent",
      "Redis.MemoryUsagePercentage",
      "Redis.CurrConnections",
      "Redis.Evictions",
      "RDS.CPUUtilization",
      "RDS.DatabaseConnections",
    ],
    logSource: "game",
    requiredEnv: COMMON_REQUIRED_ENV,
    collectsTraces: true,
    deploymentServices: ["api", "game"],
  },
  API_TARGET_5XX: {
    alarmNameEnvVar: "API_TARGET_5XX_ALARM_NAME",
    defaultAlarmName: "SongQuiz-Prod-High-API-Target5xx",
    metricNames: [
      "API.HTTPCode_Target_5XX_Count",
      "API.TargetResponseTime",
      "API.RequestCount",
      "Game.HTTPCode_Target_5XX_Count",
      "Game.TargetResponseTime",
      "Game.RequestCount",
      "Game.RedisLockRenewFailure",
      "Game.RoomLockLeaseLost",
      "Game.StaleFencingWriteRejected",
      "RDS.CPUUtilization",
      "RDS.DatabaseConnections",
      "EC2.CPUUtilization",
      "EC2.MemoryUsedPercent",
      "Redis.MemoryUsagePercentage",
      "Redis.CurrConnections",
      "Redis.Evictions",
    ],
    // apps/api Log Group에는 구조화 app 예외 로그와 access 로그(AccessLogMiddleware)가
    // 같은 PM2 stdout으로 섞여 쌓인다(collect-logs.ts의 API_QUERY 참고).
    logSource: "api",
    // API_TARGET_5XX만 API_LOG_GROUP_NAME이 추가로 필요하다 - terraform apply 전에 CI가
    // 코드를 먼저 배포해도 다른 두 IncidentType은 영향받지 않는다(apps/lambda/CLAUDE.md).
    requiredEnv: [...COMMON_REQUIRED_ENV, "API_LOG_GROUP_NAME"],
    collectsTraces: true,
    deploymentServices: ["api", "game"],
  },
};
