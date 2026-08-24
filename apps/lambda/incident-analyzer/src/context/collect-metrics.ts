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

// count 계열(이벤트 발생 시에만 값이 존재)과 gauge/continuous 계열(항상 어떤 값이든
// 존재해야 정상)은 datapoint가 없을 때의 의미가 다르다(§9~10). 이 Alarm 하나 때문에
// 과도한 generic metric framework를 만들지 않고, 이 7개 metric에 대한 정책만 명시한다.
type MetricSemantic = "sparse_count" | "gauge";

const METRIC_SEMANTICS: Record<string, MetricSemantic> = {
  "Game.QuizSnapshotFailure": "sparse_count",
  "API.HTTPCode_Target_5XX_Count": "sparse_count",
  "Game.HTTPCode_Target_5XX_Count": "sparse_count",
  "API.TargetResponseTime": "gauge",
  "Game.TargetResponseTime": "gauge",
  "RDS.CPUUtilization": "gauge",
  "RDS.DatabaseConnections": "gauge",
};

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

// 이 7개 외의 이름이 들어올 일은 없지만(buildQuerySpecs가 고정된 spec만 만든다), 정책에
// 없는 이름이 들어와도 gauge로 안전하게 취급한다(sparse count로 잘못 취급해 원본 null을
// 0으로 덮어쓰는 쪽보다, 값을 모른다고 두는 쪽이 더 안전한 기본값이다).
function resolveSemantic(name: string): MetricSemantic {
  return METRIC_SEMANTICS[name] ?? "gauge";
}

function summarize(
  name: string,
  timestamps: Date[],
  values: number[],
): MetricSummary {
  if (values.length === 0) {
    const semantic = resolveSemantic(name);
    return {
      name,
      current: null,
      average15m: null,
      max15m: null,
      trend: "unknown",
      hasData: false,
      dataState: "NO_DATAPOINT",
      // sparse count metric만 "0건 관측"이라는 의미의 semanticValue를 채운다(§9) - 원본
      // current(null)는 그대로 두고 별도 필드로만 표현한다.
      ...(semantic === "sparse_count" ? { semanticValue: 0 } : {}),
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
    hasData: true,
    dataState: "OBSERVED",
  };
}

/** AWS API 조회 자체가 실패했을 때(§7) 각 metric을 이름은 남기고 COLLECTION_FAILED로 채운다. */
function collectionFailedSummary(name: string): MetricSummary {
  return {
    name,
    current: null,
    average15m: null,
    max15m: null,
    trend: "unknown",
    hasData: false,
    dataState: "COLLECTION_FAILED",
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
    // 빈 배열 대신 기대했던 7개 metric 이름을 COLLECTION_FAILED로 채워 돌려준다 - AI가
    // "어떤 metric을 확인하지 못했는지"를 이름으로 알 수 있게 한다(§7~8).
    return {
      status: "failed",
      metrics: specs.map((spec) => collectionFailedSummary(spec.name)),
    };
  }
}
