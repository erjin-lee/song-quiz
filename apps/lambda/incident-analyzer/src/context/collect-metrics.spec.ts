const sendMock = jest.fn();

jest.mock("@aws-sdk/client-cloudwatch", () => ({
  CloudWatchClient: jest.fn().mockImplementation(() => ({ send: sendMock })),
  GetMetricDataCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

import { collectMetrics, CollectMetricsConfig } from "./collect-metrics";

const CONFIG: CollectMetricsConfig = {
  gameMetricNamespace: "SongQuiz/Game",
  albArnSuffix: "app/deploy-terraform-alb/abc",
  apiTargetGroupArnSuffix: "targetgroup/deploy-terraform-api/def",
  gameTargetGroupArnSuffix: "targetgroup/deploy-terraform-game/ghi",
  dbInstanceIdentifier: "deploy-terraform-db",
};

const WINDOW = {
  startTime: new Date("2026-08-24T02:15:00.000Z"),
  endTime: new Date("2026-08-24T02:30:00.000Z"),
};

describe("collectMetrics", () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  it("datapoint를 current(최신값)/average15m/max15m/trend로 요약한다", async () => {
    sendMock.mockResolvedValueOnce({
      MetricDataResults: [
        {
          Id: "gameQuizSnapshotFailure",
          // GetMetricData는 최신순(내림차순)으로 돌려준다.
          Timestamps: [
            new Date("2026-08-24T02:29:00.000Z"),
            new Date("2026-08-24T02:20:00.000Z"),
            new Date("2026-08-24T02:16:00.000Z"),
          ],
          Values: [6, 4, 0],
        },
      ],
    });

    const result = await collectMetrics(WINDOW, CONFIG);

    expect(result.status).toBe("success");
    const metric = result.metrics.find(
      (m) => m.name === "Game.QuizSnapshotFailure",
    );
    expect(metric).toEqual({
      name: "Game.QuizSnapshotFailure",
      current: 6,
      average15m: (0 + 4 + 6) / 3,
      max15m: 6,
      trend: "increasing",
      hasData: true,
      dataState: "OBSERVED",
    });
  });

  it("datapoint가 없으면 조회는 성공했지만 값을 못 찾았다는 의미로 요약한다(§7~9)", async () => {
    sendMock.mockResolvedValueOnce({ MetricDataResults: [] });

    const result = await collectMetrics(WINDOW, CONFIG);

    expect(result.status).toBe("success");
    for (const metric of result.metrics) {
      expect(metric.trend).toBe("unknown");
      expect(metric.current).toBeNull();
      expect(metric.hasData).toBe(false);
      expect(metric.dataState).toBe("NO_DATAPOINT");
    }

    // sparse count 계열(이벤트 발생 시에만 값이 존재)은 "이 구간에 0건 관측"이라는 의미로
    // semanticValue를 0으로 채운다 - 원본 current(null)는 그대로 둔다.
    const sparseCountMetric = result.metrics.find(
      (m) => m.name === "Game.QuizSnapshotFailure",
    );
    expect(sparseCountMetric?.current).toBeNull();
    expect(sparseCountMetric?.semanticValue).toBe(0);

    // gauge 계열(TargetResponseTime, RDS CPU/Connections)은 datapoint가 없으면 실제 값을
    // 알 수 없으므로 semanticValue를 채우지 않는다 - 0으로 억지 해석하면 안 된다.
    const gaugeMetric = result.metrics.find(
      (m) => m.name === "API.TargetResponseTime",
    );
    expect(gaugeMetric?.semanticValue).toBeUndefined();
  });

  it("§9의 7개 metric을 모두 요청한다(QuizSnapshotFailure/API·Game 5xx·Latency/RDS CPU·Connections)", async () => {
    sendMock.mockResolvedValueOnce({ MetricDataResults: [] });

    const result = await collectMetrics(WINDOW, CONFIG);

    expect(result.metrics.map((m) => m.name)).toEqual([
      "Game.QuizSnapshotFailure",
      "API.HTTPCode_Target_5XX_Count",
      "API.TargetResponseTime",
      "Game.HTTPCode_Target_5XX_Count",
      "Game.TargetResponseTime",
      "RDS.CPUUtilization",
      "RDS.DatabaseConnections",
    ]);
  });

  it("GetMetricData 호출이 실패하면 failed 상태와 함께 각 metric을 COLLECTION_FAILED로 채운다(§7)", async () => {
    sendMock.mockRejectedValueOnce(new Error("boom"));

    const result = await collectMetrics(WINDOW, CONFIG);

    expect(result.status).toBe("failed");
    expect(result.metrics).toHaveLength(7);
    for (const metric of result.metrics) {
      expect(metric.dataState).toBe("COLLECTION_FAILED");
      expect(metric.current).toBeNull();
      expect(metric.hasData).toBe(false);
    }
  });
});
