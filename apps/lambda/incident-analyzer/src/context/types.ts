// AWS raw response를 그대로 OpenAI에 전달하지 않고, 이 파일의 타입들로 정규화/집계한
// 뒤(build-incident-context.ts) 그 결과만 전달한다.

export type CollectionStatus = "success" | "failed";

export type MetricTrend = "increasing" | "decreasing" | "stable" | "unknown";

export interface MetricSummary {
  name: string;
  current: number | null;
  average15m: number | null;
  max15m: number | null;
  trend: MetricTrend;
}

// 개인정보/민감정보 allowlist(§13) - 이 필드 목록에 없는 값은 로그 원본에 있어도
// IncidentContext로 넘기지 않는다.
export interface LogSample {
  timestamp: string;
  level?: string;
  event?: string;
  errorCode?: string;
  message?: string;
  requestId?: string;
  traceId?: string;
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

export interface IncidentContext {
  alarm: {
    name: string;
    service: string;
    severity: string;
    signal: string;
    state: "ALARM";
    triggeredAt: string;
    reason?: string;
  };
  metrics: MetricSummary[];
  logs: LogsSummary;
  traces: TraceSummary[];
  collection: {
    metrics: CollectionStatus;
    logs: CollectionStatus;
    traces: CollectionStatus;
  };
}

export interface AnalysisWindow {
  startTime: Date;
  endTime: Date;
}
