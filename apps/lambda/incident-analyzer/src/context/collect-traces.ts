import { BatchGetTracesCommand, XRayClient } from "@aws-sdk/client-xray";
import { CollectionStatus, TraceSummary, TraceSpanSummary } from "./types";

const xrayClient = new XRayClient({});

// X-Ray raw segment document 전체를 OpenAI에 넘기지 않고 대표 trace만 요약한다(§15).
const MAX_TRACE_COUNT = 5;
const MAX_SLOWEST_SPANS = 5;

/**
 * OTel W3C trace ID(32자리 hex)를 X-Ray trace ID 형식("1-{8자리 hex}-{24자리 hex}")으로
 * 변환한다. CloudWatch Agent가 OTLP로 받은 span을 X-Ray로 전달할 때 이 변환을 그대로
 * 적용하므로(ARCHITECTURE.md Observability 절), packages/tracing의 game/api 로그에 남는
 * traceId로 곧바로 BatchGetTraces를 조회할 수 있다. 실제 변환 방식은 배포 후
 * 실 트래픽으로 한 번 더 검증이 필요하다(README 참고).
 */
export function otelTraceIdToXrayTraceId(traceId: string): string | null {
  if (!/^[0-9a-f]{32}$/i.test(traceId)) {
    return null;
  }
  return `1-${traceId.slice(0, 8)}-${traceId.slice(8)}`;
}

interface XraySegmentDocument {
  id?: string;
  name?: string;
  origin?: string;
  start_time?: number;
  end_time?: number;
  error?: boolean;
  fault?: boolean;
  throttle?: boolean;
  subsegments?: XraySegmentDocument[];
}

function segmentDurationMs(doc: XraySegmentDocument): number | undefined {
  if (typeof doc.start_time !== "number" || typeof doc.end_time !== "number") {
    return undefined;
  }
  return Math.round((doc.end_time - doc.start_time) * 1000);
}

/** 최상위 segment(서비스 단위)와 그 아래 subsegment를 모두 평평한 span 목록으로 만든다. */
function flattenSpans(
  doc: XraySegmentDocument,
  service: string,
): TraceSpanSummary[] {
  const spans: TraceSpanSummary[] = [
    {
      service,
      name: doc.name ?? "unknown",
      durationMs: segmentDurationMs(doc),
      error: Boolean(doc.error || doc.fault || doc.throttle),
    },
  ];

  for (const sub of doc.subsegments ?? []) {
    // subsegment는 부모와 같은 서비스에 속한다(다른 서비스로의 호출은 X-Ray가
    // 별도 top-level segment로 표현하고 trace ID로만 연결한다).
    spans.push(...flattenSpans(sub, service));
  }

  return spans;
}

function parseSegmentDocument(document: string): XraySegmentDocument | null {
  try {
    return JSON.parse(document) as XraySegmentDocument;
  } catch {
    return null;
  }
}

function summarizeTrace(
  traceId: string,
  segmentDocuments: string[],
): TraceSummary {
  const docs = segmentDocuments
    .map(parseSegmentDocument)
    .filter((doc): doc is XraySegmentDocument => doc !== null);

  const spans = docs.flatMap((doc) =>
    flattenSpans(doc, doc.origin ?? doc.name ?? "unknown"),
  );

  const startTimes = docs
    .map((doc) => doc.start_time)
    .filter((t): t is number => t !== undefined);
  const endTimes = docs
    .map((doc) => doc.end_time)
    .filter((t): t is number => t !== undefined);

  const totalDurationMs =
    startTimes.length > 0 && endTimes.length > 0
      ? Math.round((Math.max(...endTimes) - Math.min(...startTimes)) * 1000)
      : undefined;

  const slowestSpans = spans
    .filter(
      (span): span is TraceSpanSummary & { durationMs: number } =>
        span.durationMs !== undefined,
    )
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, MAX_SLOWEST_SPANS)
    .map(({ service, name, durationMs }) => ({ service, name, durationMs }));

  return {
    traceId,
    totalDurationMs,
    hasError: spans.some((span) => span.error),
    spans,
    slowestSpans,
  };
}

export interface CollectTracesResult {
  status: CollectionStatus;
  traces: TraceSummary[];
}

/**
 * quiz_snapshot_failed 로그에서 얻은 traceId만 조회한다(§14) - 최근 15분 전체 X-Ray를
 * 스캔하는 fallback은 만들지 않는다(관련 traceId가 없으면 traces는 빈 배열로 둔다).
 */
export async function collectTraces(
  otelTraceIds: string[],
): Promise<CollectTracesResult> {
  const uniqueTraceIds = Array.from(new Set(otelTraceIds)).slice(
    0,
    MAX_TRACE_COUNT,
  );
  if (uniqueTraceIds.length === 0) {
    return { status: "success", traces: [] };
  }

  const xrayTraceIdByOtel = new Map<string, string>();
  for (const otelTraceId of uniqueTraceIds) {
    const xrayTraceId = otelTraceIdToXrayTraceId(otelTraceId);
    if (xrayTraceId) {
      xrayTraceIdByOtel.set(otelTraceId, xrayTraceId);
    }
  }
  if (xrayTraceIdByOtel.size === 0) {
    return { status: "success", traces: [] };
  }

  try {
    const response = await xrayClient.send(
      new BatchGetTracesCommand({
        TraceIds: Array.from(xrayTraceIdByOtel.values()),
      }),
    );

    const traces = (response.Traces ?? []).map((trace) =>
      summarizeTrace(
        trace.Id ?? "unknown",
        (trace.Segments ?? [])
          .map((segment) => segment.Document)
          .filter((doc): doc is string => Boolean(doc)),
      ),
    );

    return { status: "success", traces };
  } catch {
    return { status: "failed", traces: [] };
  }
}
