import { CollectMetricsResult } from "./collect-metrics";
import { CollectLogsResult } from "./collect-logs";
import { CollectTracesResult } from "./collect-traces";
import { IncidentContext } from "./types";

export interface AlarmInfo {
  name: string;
  service: string;
  severity: string;
  signal: string;
  triggeredAt: string;
  reason?: string;
}

/** AWS raw response가 아니라 이미 정규화된 각 collector의 결과만 모아 IncidentContext를 만든다(§8). */
export function buildIncidentContext(
  alarm: AlarmInfo,
  metricsResult: CollectMetricsResult,
  logsResult: CollectLogsResult,
  tracesResult: CollectTracesResult,
): IncidentContext {
  return {
    alarm: {
      name: alarm.name,
      service: alarm.service,
      severity: alarm.severity,
      signal: alarm.signal,
      state: "ALARM",
      triggeredAt: alarm.triggeredAt,
      reason: alarm.reason,
    },
    metrics: metricsResult.metrics,
    logs: logsResult.logs,
    traces: tracesResult.traces,
    collection: {
      metrics: metricsResult.status,
      logs: logsResult.status,
      traces: tracesResult.status,
    },
  };
}

/**
 * 핵심 데이터(Metrics/Logs)가 전부 실패하면 OpenAI를 호출하지 않는다(§16) - Trace는
 * traceId가 없어 조회를 시도조차 못 하는 경우가 흔해(§14) 필수 데이터로 보지 않는다.
 */
export function hasSufficientContext(context: IncidentContext): boolean {
  return (
    context.collection.metrics === "success" ||
    context.collection.logs === "success"
  );
}
