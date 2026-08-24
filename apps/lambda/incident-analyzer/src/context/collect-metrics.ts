import {
  CloudWatchClient,
  GetMetricDataCommand,
  MetricDataQuery,
} from "@aws-sdk/client-cloudwatch";
import {
  AnalysisWindow,
  CollectionStatus,
  MetricSummary,
  MetricTrend,
} from "./types";

const cloudWatchClient = new CloudWatchClient({});

// GetMetricData는 요청한 period가 metric의 실제 발행 주기보다 촘촘해도(예: RDS 기본
// 모니터링은 5분 단위인데 60초로 요청) 에러 없이 그 주기에 맞는 datapoint만 채워
// 돌려준다 - 그래서 모든 metric에 동일하게 60초를 요청해 한 번의 API 호출로 묶는다.
const PERIOD_SECONDS = 60;

interface MetricQuerySpec {
  id: string;
  name: string;
  namespace: string;
  metricName: string;
  stat: "Sum" | "Average" | "Maximum";
  dimensions?: Record<string, string>;
}

export interface CollectMetricsConfig {
  gameMetricNamespace: string;
  albArnSuffix: string;
  apiTargetGroupArnSuffix: string;
  gameTargetGroupArnSuffix: string;
  dbInstanceIdentifier: string;
}

export interface CollectMetricsResult {
  status: CollectionStatus;
  metrics: MetricSummary[];
}

function buildQuerySpecs(config: CollectMetricsConfig): MetricQuerySpec[] {
  const albDimensions = (targetGroupArnSuffix: string) => ({
    LoadBalancer: config.albArnSuffix,
    TargetGroup: targetGroupArnSuffix,
  });

  return [
    {
      id: "gameQuizSnapshotFailure",
      name: "Game.QuizSnapshotFailure",
      namespace: config.gameMetricNamespace,
      metricName: "QuizSnapshotFailure",
      stat: "Sum",
    },
    {
      id: "api5xx",
      name: "API.HTTPCode_Target_5XX_Count",
      namespace: "AWS/ApplicationELB",
      metricName: "HTTPCode_Target_5XX_Count",
      stat: "Sum",
      dimensions: albDimensions(config.apiTargetGroupArnSuffix),
    },
    {
      id: "apiLatency",
      name: "API.TargetResponseTime",
      namespace: "AWS/ApplicationELB",
      metricName: "TargetResponseTime",
      stat: "Average",
      dimensions: albDimensions(config.apiTargetGroupArnSuffix),
    },
    {
      id: "game5xx",
      name: "Game.HTTPCode_Target_5XX_Count",
      namespace: "AWS/ApplicationELB",
      metricName: "HTTPCode_Target_5XX_Count",
      stat: "Sum",
      dimensions: albDimensions(config.gameTargetGroupArnSuffix),
    },
    {
      id: "gameLatency",
      name: "Game.TargetResponseTime",
      namespace: "AWS/ApplicationELB",
      metricName: "TargetResponseTime",
      stat: "Average",
      dimensions: albDimensions(config.gameTargetGroupArnSuffix),
    },
    {
      id: "rdsCpu",
      name: "RDS.CPUUtilization",
      namespace: "AWS/RDS",
      metricName: "CPUUtilization",
      stat: "Average",
      dimensions: { DBInstanceIdentifier: config.dbInstanceIdentifier },
    },
    {
      id: "rdsConnections",
      name: "RDS.DatabaseConnections",
      namespace: "AWS/RDS",
      metricName: "DatabaseConnections",
      stat: "Average",
      dimensions: { DBInstanceIdentifier: config.dbInstanceIdentifier },
    },
  ];
}

/**
 * datapoint 값들로 단순하고 deterministic한 trend를 계산한다(§10) - ML/anomaly
 * detection은 쓰지 않는다. 앞 절반 평균 대비 뒤 절반 평균이 10% 넘게 변하면
 * increasing/decreasing, 그 안이면 stable. datapoint가 2개 미만이면 unknown.
 */
function computeTrend(values: number[]): MetricTrend {
  if (values.length < 2) {
    return "unknown";
  }

  const mid = Math.floor(values.length / 2);
  const firstHalf = values.slice(0, mid);
  const secondHalf = values.slice(mid);
  const avg = (arr: number[]) =>
    arr.reduce((sum, v) => sum + v, 0) / arr.length;
  const firstAvg = avg(firstHalf);
  const secondAvg = avg(secondHalf);

  if (firstAvg === 0 && secondAvg === 0) {
    return "stable";
  }

  const base = Math.abs(firstAvg) || 1;
  const changeRatio = (secondAvg - firstAvg) / base;

  if (changeRatio > 0.1) {
    return "increasing";
  }
  if (changeRatio < -0.1) {
    return "decreasing";
  }
  return "stable";
}

function summarize(
  name: string,
  timestamps: Date[],
  values: number[],
): MetricSummary {
  if (values.length === 0) {
    return {
      name,
      current: null,
      average15m: null,
      max15m: null,
      trend: "unknown",
    };
  }

  // GetMetricData는 timestamp 내림차순으로 돌려준다 - 가장 최근 값을 current로 쓰려면
  // 정렬 방향을 오름차순으로 뒤집어 trend 계산도 시간순으로 맞춘다.
  const chronological = timestamps
    .map((timestamp, index) => ({ timestamp, value: values[index] }))
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const orderedValues = chronological.map((point) => point.value);

  return {
    name,
    current: orderedValues[orderedValues.length - 1],
    average15m:
      orderedValues.reduce((sum, v) => sum + v, 0) / orderedValues.length,
    max15m: Math.max(...orderedValues),
    trend: computeTrend(orderedValues),
  };
}

/**
 * QuizSnapshotFailure 분석에 필요한 최소 Metric 세트(§9)를 GetMetricData 한 번으로
 * 조회한다. 새 Custom Metric/Metric Filter는 만들지 않고, monitoring 모듈 Dashboard가
 * 이미 쓰는 것과 동일한 namespace/dimension만 재사용한다.
 */
export async function collectMetrics(
  window: AnalysisWindow,
  config: CollectMetricsConfig,
): Promise<CollectMetricsResult> {
  const specs = buildQuerySpecs(config);
  const queries: MetricDataQuery[] = specs.map((spec) => ({
    Id: spec.id,
    MetricStat: {
      Metric: {
        Namespace: spec.namespace,
        MetricName: spec.metricName,
        Dimensions: spec.dimensions
          ? Object.entries(spec.dimensions).map(([Name, Value]) => ({
              Name,
              Value,
            }))
          : undefined,
      },
      Period: PERIOD_SECONDS,
      Stat: spec.stat,
    },
  }));

  try {
    const response = await cloudWatchClient.send(
      new GetMetricDataCommand({
        StartTime: window.startTime,
        EndTime: window.endTime,
        MetricDataQueries: queries,
      }),
    );

    const resultById = new Map(
      (response.MetricDataResults ?? []).map((result) => [result.Id, result]),
    );

    const metrics = specs.map((spec) => {
      const result = resultById.get(spec.id);
      return summarize(
        spec.name,
        result?.Timestamps ?? [],
        result?.Values ?? [],
      );
    });

    return { status: "success", metrics };
  } catch {
    return { status: "failed", metrics: [] };
  }
}
