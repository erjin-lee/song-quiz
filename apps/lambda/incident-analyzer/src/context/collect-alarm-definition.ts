import {
  CloudWatchClient,
  DescribeAlarmsCommand,
} from "@aws-sdk/client-cloudwatch";
import { AlarmDefinition, CollectionStatus } from "./types";

const cloudWatchClient = new CloudWatchClient({});

export interface CollectAlarmDefinitionResult {
  status: CollectionStatus;
  definition?: AlarmDefinition;
}

/**
 * 실제 배포된 CloudWatch Alarm 설정을 조회해 정규화한다(§4~5) - Alarm 조건을 코드에
 * 하드코딩하지 않고, AWS에 실제 배포된 Alarm을 매번 source of truth로 조회한다.
 * 조회 실패는 전체 Incident Analysis 실패로 이어지지 않는다(§6, build-incident-context.ts).
 */
export async function collectAlarmDefinition(
  alarmName: string,
): Promise<CollectAlarmDefinitionResult> {
  try {
    const response = await cloudWatchClient.send(
      new DescribeAlarmsCommand({ AlarmNames: [alarmName] }),
    );
    const alarm = response.MetricAlarms?.[0];
    if (!alarm) {
      return { status: "failed" };
    }

    return {
      status: "success",
      definition: {
        namespace: alarm.Namespace,
        metricName: alarm.MetricName,
        statistic: alarm.Statistic,
        extendedStatistic: alarm.ExtendedStatistic,
        threshold: alarm.Threshold,
        comparisonOperator: alarm.ComparisonOperator,
        periodSeconds: alarm.Period,
        evaluationPeriods: alarm.EvaluationPeriods,
        datapointsToAlarm: alarm.DatapointsToAlarm,
        treatMissingData: alarm.TreatMissingData,
        dimensions: Object.fromEntries(
          (alarm.Dimensions ?? []).map((dimension) => [
            dimension.Name ?? "",
            dimension.Value ?? "",
          ]),
        ),
      },
    };
  } catch {
    return { status: "failed" };
  }
}
