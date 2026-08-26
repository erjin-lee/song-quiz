import {
  CloudWatchLogsClient,
  GetQueryResultsCommand,
  QueryStatus,
  StartQueryCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import {
  AnalysisWindow,
  CollectionStatus,
  IncidentType,
  LogSample,
  LogsSummary,
} from "./types";

const cloudWatchLogsClient = new CloudWatchLogsClient({});

// Logs Insights 결과 전체(최대 10,000행)를 다 끌어오지 않고, 15분 창의 대표 표본을
// 뽑기에 충분한 상한만 조회한다(§32 비용 제한).
const QUERY_ROW_LIMIT = 200;
const MAX_SAMPLE_COUNT = 8;

// query completion polling(§13) - 무한 대기하지 않고 최대 시도/전체 timeout을 둔다.
const POLL_MAX_ATTEMPTS = 10;
const POLL_INTERVAL_MS = 1000;

// IncidentType마다 조회할 Log Group이 다르다(§AIOps v1-3 - 범용 Log Plugin Framework는
// 만들지 않고, 이 작은 맵 하나로만 game/api를 고른다).
type LogSource = "game" | "api";

const LOG_SOURCE_BY_INCIDENT_TYPE: Record<IncidentType, LogSource> = {
  QUIZ_SNAPSHOT_FAILURE: "game",
  GAME_TARGET_5XX: "game",
  API_TARGET_5XX: "api",
};

// game 구조화 로그(JSON)에서 이 필드들만 CloudWatch Logs Insights로 조회한다.
// $.event/$.level/$.errorCode/$.requestId/$.traceId는 metric-filters.tf가 이미
// 전제하는 것과 동일한 최상위 JSON 필드다.
const GAME_QUERY = `
fields @timestamp, @message, event, level, errorCode, requestId, traceId
| filter event = "quiz_snapshot_failed" or level = "error"
| sort @timestamp desc
| limit ${QUERY_ROW_LIMIT}
`;

// apps/api 로그 그룹에는 구조화 app 로그(LoggingExceptionFilter, event/errorCode)와
// access 로그(AccessLogMiddleware, method/path/statusCode)가 같은 PM2 stdout으로 섞여
// 쌓인다(ecosystem.config.js가 둘 다 logs/api.log 하나로 합침). 두 로그 모두 5xx/예외
// 상황에서 level="error"를 남기므로(AccessLogMiddleware는 statusCode>=500일 때, app 로그는
// LoggingExceptionFilter가 5xx HttpException 또는 처리되지 않은 예외에서) 이 필터 하나로
// 두 종류를 함께 잡는다. game과 달리 우선시할 단일 target event가 없다.
const API_QUERY = `
fields @timestamp, @message, event, level, errorCode, requestId, traceId, method, path, statusCode
| filter level = "error"
| sort @timestamp desc
| limit ${QUERY_ROW_LIMIT}
`;

const TARGET_EVENT = "quiz_snapshot_failed";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type InsightsRow = Record<string, string>;

function rowsToRecords(
  rows: Array<Array<{ field?: string; value?: string }> | undefined>,
): InsightsRow[] {
  return rows.map((row) => {
    const record: InsightsRow = {};
    for (const field of row ?? []) {
      if (field.field !== undefined && field.value !== undefined) {
        record[field.field] = field.value;
      }
    }
    return record;
  });
}

async function runInsightsQuery(
  logGroupName: string,
  window: AnalysisWindow,
  query: string,
): Promise<InsightsRow[]> {
  const startResponse = await cloudWatchLogsClient.send(
    new StartQueryCommand({
      logGroupNames: [logGroupName],
      startTime: Math.floor(window.startTime.getTime() / 1000),
      endTime: Math.floor(window.endTime.getTime() / 1000),
      queryString: query,
    }),
  );

  const queryId = startResponse.queryId;
  if (!queryId) {
    throw new Error("CloudWatch Logs Insights query did not return a queryId");
  }

  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    await sleep(POLL_INTERVAL_MS);

    const result = await cloudWatchLogsClient.send(
      new GetQueryResultsCommand({ queryId }),
    );

    if (result.status === QueryStatus.Complete) {
      return rowsToRecords(result.results ?? []);
    }
    if (
      result.status === QueryStatus.Failed ||
      result.status === QueryStatus.Cancelled ||
      result.status === QueryStatus.Timeout
    ) {
      throw new Error(
        `CloudWatch Logs Insights query ended with status ${result.status}`,
      );
    }
    // Scheduled/Running이면 계속 polling한다.
  }

  throw new Error("CloudWatch Logs Insights query polling timed out");
}

/**
 * $.message는 room.service.ts가 "roomId: xxx, quizId: yyy"를 자유 텍스트에 직접
 * 끼워 넣는다(quiz_snapshot_failed). QuizSnapshotFailure의 원인은 특정 room이 아니라
 * API/DB 쪽 시스템 문제이므로, 로거의 redaction과 별개로 AIOps Context Collector에서
 * 한 번 더 이 값들을 지운다(§12 allowlist 원칙).
 */
function redactMessage(message: string): string {
  return message.replace(
    /\b(roomId|quizId)\s*:\s*[^\s,)]+/gi,
    "$1: [REDACTED]",
  );
}

function toLogSample(row: InsightsRow): LogSample {
  const sample: LogSample = { timestamp: row["@timestamp"] ?? "" };
  if (row.level) sample.level = row.level;
  if (row.event) sample.event = row.event;
  if (row.errorCode) sample.errorCode = row.errorCode;
  if (row.requestId) sample.requestId = row.requestId;
  if (row.traceId) sample.traceId = row.traceId;
  if (row.method) sample.method = row.method;
  if (row.path) sample.path = row.path;
  if (row.statusCode) {
    const statusCode = Number(row.statusCode);
    if (!Number.isNaN(statusCode)) sample.statusCode = statusCode;
  }

  const rawMessage = row["@message"];
  if (rawMessage) {
    sample.message = redactMessage(rawMessage).slice(0, 500);
  }
  return sample;
}

function countBy(
  rows: InsightsRow[],
  field: string,
): Array<{ key: string; count: number }> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = row[field];
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([key, count]) => ({ key, count }));
}

/**
 * 대표 샘플만 남긴다(§12) - 같은 event/errorCode 조합을 중복으로 여러 번 보내지 않는다.
 * targetEvent가 있으면(game) 그 이벤트를 우선 노출하도록 앞으로 정렬한다 - api는 우선시할
 * 단일 이벤트가 없어 정렬 없이 원본 순서(최신순)를 그대로 쓴다.
 */
function pickSamples(rows: InsightsRow[], targetEvent?: string): LogSample[] {
  const orderedRows = targetEvent
    ? [...rows].sort((a, b) => {
        const aTarget = a.event === targetEvent ? 0 : 1;
        const bTarget = b.event === targetEvent ? 0 : 1;
        return aTarget - bTarget;
      })
    : rows;

  const seen = new Set<string>();
  const samples: LogSample[] = [];

  for (const row of orderedRows) {
    if (samples.length >= MAX_SAMPLE_COUNT) break;
    // api access log 행은 event/errorCode가 거의 항상 비어 있어(app 레벨 예외 로그만 채움)
    // 그 둘만으로 dedupe하면 서로 다른 route/statusCode 오류가 한 건으로 뭉개진다 - path/
    // statusCode도 key에 포함한다(game 행은 이 두 필드가 항상 없어 기존 동작 그대로다).
    const dedupeKey = `${row.event ?? ""}::${row.errorCode ?? ""}::${row.path ?? ""}::${row.statusCode ?? ""}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    samples.push(toLogSample(row));
  }

  return samples;
}

export interface CollectLogsConfig {
  gameLogGroupName: string;
  // API_TARGET_5XX에서만 쓴다(§AIOps v1-3) - apps/lambda/CLAUDE.md 규칙대로, CI가 코드를
  // 먼저 배포해 terraform apply 전에 이 값이 아직 없을 수 있으므로 optional로 받는다.
  apiLogGroupName?: string;
}

export interface CollectLogsResult {
  status: CollectionStatus;
  logs: LogsSummary;
}

const EMPTY_LOGS_SUMMARY: LogsSummary = {
  errorCount: 0,
  eventCounts: [],
  errorCodeCounts: [],
  samples: [],
};

export async function collectLogs(
  window: AnalysisWindow,
  config: CollectLogsConfig,
  incidentType: IncidentType,
): Promise<CollectLogsResult> {
  const source = LOG_SOURCE_BY_INCIDENT_TYPE[incidentType];
  const logGroupName =
    source === "api" ? config.apiLogGroupName : config.gameLogGroupName;
  if (!logGroupName) {
    return { status: "failed", logs: EMPTY_LOGS_SUMMARY };
  }

  const query = source === "api" ? API_QUERY : GAME_QUERY;
  const targetEvent = source === "game" ? TARGET_EVENT : undefined;

  try {
    const rows = await runInsightsQuery(logGroupName, window, query);

    const logs: LogsSummary = {
      errorCount: rows.length,
      eventCounts: countBy(rows, "event").map(({ key, count }) => ({
        event: key,
        count,
      })),
      errorCodeCounts: countBy(rows, "errorCode").map(({ key, count }) => ({
        errorCode: key,
        count,
      })),
      samples: pickSamples(rows, targetEvent),
    };

    return { status: "success", logs };
  } catch {
    return { status: "failed", logs: EMPTY_LOGS_SUMMARY };
  }
}
