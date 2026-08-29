const sendMock = jest.fn();

jest.mock("@aws-sdk/client-cloudwatch", () => ({
  CloudWatchClient: jest.fn().mockImplementation(() => ({ send: sendMock })),
  GetMetricDataCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

import { MetricDataQuery } from "@aws-sdk/client-cloudwatch";
import { collectMetrics, CollectMetricsConfig } from "./collect-metrics";

const CONFIG: CollectMetricsConfig = {
  gameMetricNamespace: "SongQuiz/Game",
  albArnSuffix: "app/deploy-terraform-alb/abc",
  apiTargetGroupArnSuffix: "targetgroup/deploy-terraform-api/def",
  gameTargetGroupArnSuffix: "targetgroup/deploy-terraform-game/ghi",
  dbInstanceIdentifier: "deploy-terraform-db",
  ec2InstanceId: "i-088da98215dd782e4",
  ec2MetricNamespace: "SongQuiz/EC2",
  cacheClusterId: "deploy-terraform-cache",
  ecsClusterName: "song-quiz-cluster",
  ecsApiServiceName: "song-quiz-api",
};

const WINDOW = {
  startTime: new Date("2026-08-24T02:15:00.000Z"),
  endTime: new Date("2026-08-24T02:30:00.000Z"),
};

describe("collectMetrics", () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  describe("QUIZ_SNAPSHOT_FAILURE", () => {
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

      const result = await collectMetrics(
        WINDOW,
        CONFIG,
        "QUIZ_SNAPSHOT_FAILURE",
      );

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

      const result = await collectMetrics(
        WINDOW,
        CONFIG,
        "QUIZ_SNAPSHOT_FAILURE",
      );

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

    it("§9의 7개 metric + room 분산 락 3종을 모두 요청한다(QuizSnapshotFailure/lock 3종/API·Game 5xx·Latency/RDS CPU·Connections)", async () => {
      sendMock.mockResolvedValueOnce({ MetricDataResults: [] });

      const result = await collectMetrics(
        WINDOW,
        CONFIG,
        "QUIZ_SNAPSHOT_FAILURE",
      );

      expect(result.metrics.map((m) => m.name)).toEqual([
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
      ]);
    });

    it("GetMetricData 호출이 실패하면 failed 상태와 함께 각 metric을 COLLECTION_FAILED로 채운다(§7)", async () => {
      sendMock.mockRejectedValueOnce(new Error("boom"));

      const result = await collectMetrics(
        WINDOW,
        CONFIG,
        "QUIZ_SNAPSHOT_FAILURE",
      );

      expect(result.status).toBe("failed");
      expect(result.metrics).toHaveLength(10);
      for (const metric of result.metrics) {
        expect(metric.dataState).toBe("COLLECTION_FAILED");
        expect(metric.current).toBeNull();
        expect(metric.hasData).toBe(false);
      }
    });
  });

  describe("GAME_TARGET_5XX(신규)", () => {
    it("요청받은 19개 metric을 정확한 이름으로 모두 요청한다", async () => {
      sendMock.mockResolvedValueOnce({ MetricDataResults: [] });

      const result = await collectMetrics(WINDOW, CONFIG, "GAME_TARGET_5XX");

      expect(result.status).toBe("success");
      expect(result.metrics.map((m) => m.name)).toEqual([
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
      ]);
    });

    it("EC2/Redis metric을 실제 dashboard.tf와 동일한 namespace/dimension으로 조회한다", async () => {
      sendMock.mockResolvedValueOnce({ MetricDataResults: [] });

      await collectMetrics(WINDOW, CONFIG, "GAME_TARGET_5XX");

      const input = sendMock.mock.calls[0][0].input;
      const queryByName = new Map<string, MetricDataQuery>(
        input.MetricDataQueries.map((q: MetricDataQuery) => [q.Id, q]),
      );

      expect(queryByName.get("ec2Cpu")?.MetricStat?.Metric).toEqual({
        Namespace: "AWS/EC2",
        MetricName: "CPUUtilization",
        Dimensions: [{ Name: "InstanceId", Value: CONFIG.ec2InstanceId }],
      });
      expect(queryByName.get("ec2Memory")?.MetricStat?.Metric).toEqual({
        Namespace: CONFIG.ec2MetricNamespace,
        MetricName: "mem_used_percent",
        Dimensions: [{ Name: "InstanceId", Value: CONFIG.ec2InstanceId }],
      });
      expect(queryByName.get("redisMemory")?.MetricStat?.Metric).toEqual({
        Namespace: "AWS/ElastiCache",
        MetricName: "DatabaseMemoryUsagePercentage",
        Dimensions: [{ Name: "CacheClusterId", Value: CONFIG.cacheClusterId }],
      });
      expect(
        queryByName.get("gameRedisLockFailure")?.MetricStat?.Metric,
      ).toEqual({
        Namespace: CONFIG.gameMetricNamespace,
        MetricName: "RedisLockFailure",
        Dimensions: undefined,
      });
      expect(
        queryByName.get("gameRedisLockRenewFailure")?.MetricStat?.Metric,
      ).toEqual({
        Namespace: CONFIG.gameMetricNamespace,
        MetricName: "RedisLockRenewFailure",
        Dimensions: undefined,
      });
      expect(
        queryByName.get("gameRoomLockLeaseLost")?.MetricStat?.Metric,
      ).toEqual({
        Namespace: CONFIG.gameMetricNamespace,
        MetricName: "RoomLockLeaseLost",
        Dimensions: undefined,
      });
      expect(
        queryByName.get("gameStaleFencingWriteRejected")?.MetricStat?.Metric,
      ).toEqual({
        Namespace: CONFIG.gameMetricNamespace,
        MetricName: "StaleFencingWriteRejected",
        Dimensions: undefined,
      });
    });

    it("datapoint가 없으면 RequestCount/RedisLockFailure/TimerClaimFailure/Evictions도 0건 관측으로, gauge는 알 수 없음으로 취급한다", async () => {
      sendMock.mockResolvedValueOnce({ MetricDataResults: [] });

      const result = await collectMetrics(WINDOW, CONFIG, "GAME_TARGET_5XX");

      const sparse = [
        "Game.RequestCount",
        "API.RequestCount",
        "Game.RedisLockFailure",
        "Game.TimerClaimFailure",
        "Game.RedisLockRenewFailure",
        "Game.RoomLockLeaseLost",
        "Game.StaleFencingWriteRejected",
        "Redis.Evictions",
      ];
      for (const name of sparse) {
        const metric = result.metrics.find((m) => m.name === name);
        expect(metric?.semanticValue).toBe(0);
      }

      const gauges = [
        "EC2.CPUUtilization",
        "EC2.MemoryUsedPercent",
        "Redis.MemoryUsagePercentage",
        "Redis.CurrConnections",
      ];
      for (const name of gauges) {
        const metric = result.metrics.find((m) => m.name === name);
        expect(metric?.semanticValue).toBeUndefined();
      }
    });

    it("GetMetricData 호출이 실패하면 failed 상태와 함께 19개 metric을 COLLECTION_FAILED로 채운다", async () => {
      sendMock.mockRejectedValueOnce(new Error("boom"));

      const result = await collectMetrics(WINDOW, CONFIG, "GAME_TARGET_5XX");

      expect(result.status).toBe("failed");
      expect(result.metrics).toHaveLength(19);
      for (const metric of result.metrics) {
        expect(metric.dataState).toBe("COLLECTION_FAILED");
      }
    });
  });

  describe("API_TARGET_5XX(신규)", () => {
    it("요청받은 13개 metric + room 분산 락 3종을 정확한 이름으로 모두 요청한다(3단계 - EC2.CPUUtilization/EC2.MemoryUsedPercent 대신 ECS.API.CPUUtilization/ECS.API.MemoryUtilization을 쓴다)", async () => {
      sendMock.mockResolvedValueOnce({ MetricDataResults: [] });

      const result = await collectMetrics(WINDOW, CONFIG, "API_TARGET_5XX");

      expect(result.status).toBe("success");
      expect(result.metrics.map((m) => m.name)).toEqual([
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
        "ECS.API.CPUUtilization",
        "ECS.API.MemoryUtilization",
        "Redis.MemoryUsagePercentage",
        "Redis.CurrConnections",
        "Redis.Evictions",
      ]);
    });

    it("ECS API CPU/Memory metric을 실제 ecs 모듈과 동일한 namespace/dimension으로 조회한다(3단계)", async () => {
      sendMock.mockResolvedValueOnce({ MetricDataResults: [] });

      await collectMetrics(WINDOW, CONFIG, "API_TARGET_5XX");

      const input = sendMock.mock.calls[0][0].input;
      const queryByName = new Map<string, MetricDataQuery>(
        input.MetricDataQueries.map((q: MetricDataQuery) => [q.Id, q]),
      );

      expect(queryByName.get("ecsApiCpu")?.MetricStat?.Metric).toEqual({
        Namespace: "AWS/ECS",
        MetricName: "CPUUtilization",
        Dimensions: [
          { Name: "ClusterName", Value: CONFIG.ecsClusterName },
          { Name: "ServiceName", Value: CONFIG.ecsApiServiceName },
        ],
      });
      expect(queryByName.get("ecsApiMemory")?.MetricStat?.Metric).toEqual({
        Namespace: "AWS/ECS",
        MetricName: "MemoryUtilization",
        Dimensions: [
          { Name: "ClusterName", Value: CONFIG.ecsClusterName },
          { Name: "ServiceName", Value: CONFIG.ecsApiServiceName },
        ],
      });
    });

    it("GetMetricData 호출이 실패하면 failed 상태와 함께 16개 metric을 COLLECTION_FAILED로 채운다", async () => {
      sendMock.mockRejectedValueOnce(new Error("boom"));

      const result = await collectMetrics(WINDOW, CONFIG, "API_TARGET_5XX");

      expect(result.status).toBe("failed");
      expect(result.metrics).toHaveLength(16);
      for (const metric of result.metrics) {
        expect(metric.dataState).toBe("COLLECTION_FAILED");
      }
    });
  });
});
