const sendMock = jest.fn();

jest.mock("@aws-sdk/client-cloudwatch", () => ({
  CloudWatchClient: jest.fn().mockImplementation(() => ({ send: sendMock })),
  DescribeAlarmsCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

import { collectAlarmDefinition } from "./collect-alarm-definition";

const ALARM_NAME = "SongQuiz-Prod-High-Game-QuizSnapshotFailure";

describe("collectAlarmDefinition", () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  it("DescribeAlarms 응답을 AlarmDefinition으로 정규화한다(§5)", async () => {
    sendMock.mockResolvedValueOnce({
      MetricAlarms: [
        {
          Namespace: "SongQuiz/Game",
          MetricName: "QuizSnapshotFailure",
          Statistic: "Sum",
          Threshold: 1,
          ComparisonOperator: "GreaterThanOrEqualToThreshold",
          Period: 300,
          EvaluationPeriods: 1,
          DatapointsToAlarm: 1,
          TreatMissingData: "notBreaching",
          Dimensions: [],
        },
      ],
    });

    const result = await collectAlarmDefinition(ALARM_NAME);

    expect(result).toEqual({
      status: "success",
      definition: {
        namespace: "SongQuiz/Game",
        metricName: "QuizSnapshotFailure",
        statistic: "Sum",
        extendedStatistic: undefined,
        threshold: 1,
        comparisonOperator: "GreaterThanOrEqualToThreshold",
        periodSeconds: 300,
        evaluationPeriods: 1,
        datapointsToAlarm: 1,
        treatMissingData: "notBreaching",
        dimensions: {},
      },
    });
  });

  it("dimensions가 있으면 Name/Value 배열을 Record로 정규화한다", async () => {
    sendMock.mockResolvedValueOnce({
      MetricAlarms: [
        {
          Namespace: "AWS/ApplicationELB",
          MetricName: "HTTPCode_Target_5XX_Count",
          Dimensions: [
            { Name: "LoadBalancer", Value: "app/deploy-terraform-alb/abc" },
            {
              Name: "TargetGroup",
              Value: "targetgroup/deploy-terraform-api/def",
            },
          ],
        },
      ],
    });

    const result = await collectAlarmDefinition(ALARM_NAME);

    expect(result.definition?.dimensions).toEqual({
      LoadBalancer: "app/deploy-terraform-alb/abc",
      TargetGroup: "targetgroup/deploy-terraform-api/def",
    });
  });

  it("Alarm을 찾지 못하면 failed 상태를 반환한다", async () => {
    sendMock.mockResolvedValueOnce({ MetricAlarms: [] });

    const result = await collectAlarmDefinition(ALARM_NAME);

    expect(result).toEqual({ status: "failed" });
  });

  it("DescribeAlarms 호출이 실패하면 failed 상태를 반환한다(§6 - 전체 분석 실패로 이어지지 않음)", async () => {
    sendMock.mockRejectedValueOnce(new Error("boom"));

    const result = await collectAlarmDefinition(ALARM_NAME);

    expect(result).toEqual({ status: "failed" });
  });
});
