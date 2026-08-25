import {
  CloudWatchClient,
  GetMetricDataCommand,
} from "@aws-sdk/client-cloudwatch";

// AWS Lambda Node.js 관리형 런타임이 AWS SDK v3를 이미 포함하므로(get-slack-webhook-url.ts와
// 동일한 이유), @aws-sdk/client-cloudwatch도 devDependencies로만 선언하고 배포 zip에는
// 번들링하지 않는다.
const cloudWatchClient = new CloudWatchClient({});

// QuizSnapshotFailure가 OK로 전환된 시점 기준 최근 lookbackMinutes분 동안 GameStartSuccess
// 지표(namespace/metricName)가 몇 건 쌓였는지 합산한다. 단일 GetMetricData 쿼리로 조회 구간
// 전체를 하나의 Period로 묶어 Sum 하나만 받아온다.
export async function getRecentSuccessCount(
  namespace: string,
  metricName: string,
  lookbackMinutes: number,
  now: Date = new Date(),
): Promise<number> {
  const endTime = now;
  const startTime = new Date(now.getTime() - lookbackMinutes * 60_000);

  const response = await cloudWatchClient.send(
    new GetMetricDataCommand({
      StartTime: startTime,
      EndTime: endTime,
      MetricDataQueries: [
        {
          Id: "recentSuccessCount",
          MetricStat: {
            Metric: { Namespace: namespace, MetricName: metricName },
            Period: lookbackMinutes * 60,
            Stat: "Sum",
          },
          ReturnData: true,
        },
      ],
    }),
  );

  const values = response.MetricDataResults?.[0]?.Values ?? [];
  return values.reduce((sum, value) => sum + value, 0);
}
