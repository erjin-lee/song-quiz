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
    });
  });

  it("datapoint가 없는 metric은 trend unknown, 값은 null로 요약한다", async () => {
    sendMock.mockResolvedValueOnce({ MetricDataResults: [] });

    const result = await collectMetrics(WINDOW, CONFIG);

    expect(result.status).toBe("success");
    for (const metric of result.metrics) {
      expect(metric.trend).toBe("unknown");
      expect(metric.current).toBeNull();
    }
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

  it("GetMetricData 호출이 실패하면 failed 상태와 빈 배열을 반환한다", async () => {
    sendMock.mockRejectedValueOnce(new Error("boom"));

    const result = await collectMetrics(WINDOW, CONFIG);

    expect(result).toEqual({ status: "failed", metrics: [] });
  });
});
