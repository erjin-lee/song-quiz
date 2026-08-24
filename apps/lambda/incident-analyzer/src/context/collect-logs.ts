import {
  CloudWatchLogsClient,
  GetQueryResultsCommand,
  QueryStatus,
  StartQueryCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import {
  AnalysisWindow,
  CollectionStatus,
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

// game 구조화 로그(JSON)에서 이 필드들만 CloudWatch Logs Insights로 조회한다.
// $.event/$.level/$.errorCode/$.requestId/$.traceId는 metric-filters.tf가 이미
// 전제하는 것과 동일한 최상위 JSON 필드다.
const QUERY = `
fields @timestamp, @message, event, level, errorCode, requestId, traceId
| filter event = "quiz_snapshot_failed" or level = "error"
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
): Promise<InsightsRow[]> {
  const startResponse = await cloudWatchLogsClient.send(
    new StartQueryCommand({
      logGroupNames: [logGroupName],
      startTime: Math.floor(window.startTime.getTime() / 1000),
      endTime: Math.floor(window.endTime.getTime() / 1000),
      queryString: QUERY,
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

/** 대표 샘플만 남긴다(§12) - 같은 event/errorCode 조합을 중복으로 여러 번 보내지 않는다. */
function pickSamples(rows: InsightsRow[]): LogSample[] {
  const seen = new Set<string>();
  const samples: LogSample[] = [];

  for (const row of rows) {
    if (samples.length >= MAX_SAMPLE_COUNT) break;
    const dedupeKey = `${row.event ?? ""}::${row.errorCode ?? ""}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    samples.push(toLogSample(row));
  }

  return samples;
}

export interface CollectLogsConfig {
  gameLogGroupName: string;
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
): Promise<CollectLogsResult> {
  try {
    const rows = await runInsightsQuery(config.gameLogGroupName, window);

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
      // quiz_snapshot_failed를 우선 노출하도록 앞으로 정렬한 뒤 대표 샘플을 뽑는다.
      samples: pickSamples(
        [...rows].sort((a, b) => {
          const aTarget = a.event === TARGET_EVENT ? 0 : 1;
          const bTarget = b.event === TARGET_EVENT ? 0 : 1;
          return aTarget - bTarget;
        }),
      ),
    };

    return { status: "success", logs };
  } catch {
    return { status: "failed", logs: EMPTY_LOGS_SUMMARY };
  }
}
