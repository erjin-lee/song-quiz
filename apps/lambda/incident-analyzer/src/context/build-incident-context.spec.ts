import {
  buildIncidentContext,
  hasSufficientContext,
} from "./build-incident-context";
import { CollectAlarmDefinitionResult } from "./collect-alarm-definition";
import { CollectMetricsResult } from "./collect-metrics";
import { CollectLogsResult } from "./collect-logs";
import { CollectTracesResult } from "./collect-traces";
import { CollectDeploymentsResult } from "./collect-deployments";

const ALARM = {
  name: "SongQuiz-Prod-High-Game-QuizSnapshotFailure",
  service: "Game",
  severity: "High",
  signal: "QuizSnapshotFailure",
  triggeredAt: "2026-08-24T02:30:00.000Z",
  reason: "Threshold Crossed",
};

const EMPTY_LOGS: CollectLogsResult["logs"] = {
  errorCount: 0,
  eventCounts: [],
  errorCodeCounts: [],
  samples: [],
};

function result<T extends { status: "success" | "failed" }>(
  status: T["status"],
  rest: Omit<T, "status">,
): T {
  return { status, ...rest } as T;
}

const SUCCESSFUL_ALARM_DEFINITION = result<CollectAlarmDefinitionResult>(
  "success",
  {
    definition: {
      namespace: "SongQuiz/Game",
      metricName: "QuizSnapshotFailure",
    },
  },
);
const SUCCESSFUL_DEPLOYMENTS = result<CollectDeploymentsResult>("success", {
  deployments: [],
});

describe("buildIncidentContext / hasSufficientContext", () => {
  it("AWS raw response가 아니라 각 collector의 정규화된 결과만 그대로 옮긴다", () => {
    const metrics = result<CollectMetricsResult>("success", { metrics: [] });
    const logs = result<CollectLogsResult>("success", { logs: EMPTY_LOGS });
    const traces = result<CollectTracesResult>("failed", { traces: [] });

    const context = buildIncidentContext(
      ALARM,
      SUCCESSFUL_ALARM_DEFINITION,
      metrics,
      logs,
      traces,
      SUCCESSFUL_DEPLOYMENTS,
    );

    expect(context.alarm).toEqual({
      ...ALARM,
      state: "ALARM",
      definition: SUCCESSFUL_ALARM_DEFINITION.definition,
    });
    expect(context.collection).toEqual({
      alarmDefinition: "success",
      metrics: "success",
      logs: "success",
      traces: "failed",
      deployments: "success",
    });
  });

  it("Alarm Definition/Deployment 조회 실패는 전체 Incident Analysis 실패로 처리하지 않는다(§6, §29)", () => {
    const context = buildIncidentContext(
      ALARM,
      result<CollectAlarmDefinitionResult>("failed", {}),
      result<CollectMetricsResult>("success", { metrics: [] }),
      result<CollectLogsResult>("success", { logs: EMPTY_LOGS }),
      result<CollectTracesResult>("success", { traces: [] }),
      result<CollectDeploymentsResult>("failed", { deployments: [] }),
    );

    expect(hasSufficientContext(context)).toBe(true);
    expect(context.collection.alarmDefinition).toBe("failed");
    expect(context.collection.deployments).toBe("failed");
  });

  it("일부 collector(Trace)가 실패해도 Metrics/Logs 중 하나만 성공하면 분석을 계속한다(§16)", () => {
    const context = buildIncidentContext(
      ALARM,
      SUCCESSFUL_ALARM_DEFINITION,
      result<CollectMetricsResult>("success", { metrics: [] }),
      result<CollectLogsResult>("failed", { logs: EMPTY_LOGS }),
      result<CollectTracesResult>("failed", { traces: [] }),
      SUCCESSFUL_DEPLOYMENTS,
    );

    expect(hasSufficientContext(context)).toBe(true);
  });

  it("Metrics/Logs가 모두 실패하면 데이터 부족으로 판단한다", () => {
    const context = buildIncidentContext(
      ALARM,
      SUCCESSFUL_ALARM_DEFINITION,
      result<CollectMetricsResult>("failed", { metrics: [] }),
      result<CollectLogsResult>("failed", { logs: EMPTY_LOGS }),
      result<CollectTracesResult>("success", { traces: [] }),
      SUCCESSFUL_DEPLOYMENTS,
    );

    expect(hasSufficientContext(context)).toBe(false);
  });
});
