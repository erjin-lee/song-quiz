// AWS raw response를 그대로 OpenAI에 전달하지 않고, 이 파일의 타입들로 정규화/집계한
// 뒤(build-incident-context.ts) 그 결과만 전달한다.

// 이 Lambda가 분석하는 Alarm 종류(§v1-2 - 최소 공통화). 새 Alarm을 추가할 때마다 이
// union에 값을 더하고, 필요한 곳(collect-metrics.ts의 metric set 등)에서만 분기한다 -
// 범용 Policy Engine/YAML/Plugin framework는 만들지 않는다.
export type IncidentType =
  "QUIZ_SNAPSHOT_FAILURE" | "GAME_TARGET_5XX" | "API_TARGET_5XX";

export type CollectionStatus = "success" | "failed";

export type MetricTrend = "increasing" | "decreasing" | "stable" | "unknown";

// OBSERVED: window 안에 실제 datapoint가 있었다.
// NO_DATAPOINT: AWS API 조회는 성공했지만 window 안에 datapoint가 없었다(count 계열은
//   "이벤트 관측 없음"을 뜻하고, gauge 계열은 "알 수 없음"을 뜻한다 - semanticValue로 구분).
// COLLECTION_FAILED: AWS API 조회 자체가 실패했다(§7~9).
export type MetricDataState = "OBSERVED" | "NO_DATAPOINT" | "COLLECTION_FAILED";

export interface MetricSummary {
  name: string;
  current: number | null;
  average15m: number | null;
  max15m: number | null;
  trend: MetricTrend;
  hasData: boolean;
  dataState: MetricDataState;
  // sparse count metric(QuizSnapshotFailure, 5xx count)이 NO_DATAPOINT일 때만 0을 채운다 -
  // "이 구간에 이벤트가 0건 관측됨"이라는 의미를 갖는 값이다. gauge metric(TargetResponseTime,
  // RDS CPU/Connections)은 datapoint가 없으면 실제 값을 알 수 없으므로 절대 채우지 않는다(§9).
  semanticValue?: number;
}

// 개인정보/민감정보 allowlist(§13) - 이 필드 목록에 없는 값은 로그 원본에 있어도
// IncidentContext로 넘기지 않는다.
// method/path/statusCode는 API_TARGET_5XX가 조회하는 apps/api 로그의 access log 필드(실제
// 존재하는 필드 그대로, AccessLogMiddleware가 남긴다)다 - Nest 라우트 패턴(예: /quizzes/:id)이
// 아니라 요청의 실제 path이므로 id 등 가변 세그먼트가 그대로 남는다(collect-logs.ts 참고).
export interface LogSample {
  timestamp: string;
  level?: string;
  event?: string;
  errorCode?: string;
  message?: string;
  requestId?: string;
  traceId?: string;
  method?: string;
  path?: string;
  statusCode?: number;
}

export interface LogsSummary {
  errorCount: number;
  eventCounts: Array<{ event: string; count: number }>;
  errorCodeCounts: Array<{ errorCode: string; count: number }>;
  samples: LogSample[];
}

export interface TraceSpanSummary {
  service?: string;
  name: string;
  durationMs?: number;
  error?: boolean;
}

export interface TraceSummary {
  traceId: string;
  totalDurationMs?: number;
  hasError: boolean;
  spans: TraceSpanSummary[];
  slowestSpans: Array<{ service?: string; name: string; durationMs: number }>;
}

// CloudWatch DescribeAlarms 응답을 정규화한 실제 Alarm 평가 조건(§4~5). Alarm 설정을
// 코드에 하드코딩하지 않고, 매번 실제 배포된 Alarm을 source of truth로 조회한다.
export interface AlarmDefinition {
  namespace?: string;
  metricName?: string;
  statistic?: string;
  extendedStatistic?: string;
  threshold?: number;
  comparisonOperator?: string;
  periodSeconds?: number;
  evaluationPeriods?: number;
  datapointsToAlarm?: number;
  treatMissingData?: string;
  dimensions?: Record<string, string>;
}

// 전체 PR diff/review comment 등은 담지 않는다(§16, §33) - number/title/summary/changedFiles만.
export interface DeploymentPullRequest {
  number: number;
  title: string;
  summary?: string;
  changedFiles: string[];
}

// FOUND: 연결된 merged PR을 찾아 상세 정보까지 가져왔다.
// NOT_FOUND: 조회는 성공했지만 연결된 PR이 없다(direct push) - 정상적인 상태.
// FAILED: commit -> PR 또는 PR 상세/파일 목록 조회 자체(GitHub API 호출)가 실패했다 -
//   "PR이 없다"가 아니라 "확인하지 못했다"는 뜻이라 limitation으로 다뤄야 한다(§4).
export type PullRequestLookupStatus = "FOUND" | "NOT_FOUND" | "FAILED";

export interface DeploymentContext {
  service: "api" | "game";
  commitSha: string;
  deployedAt: string;
  // Alarm triggeredAt 기준 몇 분 전에 배포됐는지(§20) - 음수면 Alarm 이후에 배포된 것이라
  // 원인 후보로 쓸 수 없다는 뜻이다. AI가 직접 timestamp를 계산하지 않도록 여기서 미리 계산한다.
  minutesBeforeIncident?: number;
  pullRequestLookup: PullRequestLookupStatus;
  pullRequest?: DeploymentPullRequest;
}

export interface IncidentContext {
  alarm: {
    name: string;
    service: string;
    severity: string;
    signal: string;
    state: "ALARM";
    triggeredAt: string;
    reason?: string;
    definition?: AlarmDefinition;
  };
  metrics: MetricSummary[];
  logs: LogsSummary;
  traces: TraceSummary[];
  deployments: DeploymentContext[];
  collection: {
    alarmDefinition: CollectionStatus;
    metrics: CollectionStatus;
    logs: CollectionStatus;
    traces: CollectionStatus;
    deployments: CollectionStatus;
  };
}

export interface AnalysisWindow {
  startTime: Date;
  endTime: Date;
}
