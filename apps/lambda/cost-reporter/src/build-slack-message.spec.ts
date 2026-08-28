import { buildSlackMessage } from "./build-slack-message";

describe("buildSlackMessage", () => {
  it("정상 리포트: 순비용/크레딧/예상 비용과 서비스 Top N + 기타를 포함한다", () => {
    const message = buildSlackMessage({
      reportDate: "2026-08-27",
      previousDayUsd: 2.14,
      previousDayCreditUsd: -10.22,
      monthToDateUsd: 31.72,
      monthToDateCreditUsd: -102.2,
      monthForecastUsd: 48.2,
      topServices: [
        { service: "Amazon EC2", amountUsd: 0.82 },
        { service: "Amazon RDS", amountUsd: 0.54 },
      ],
      otherServicesUsd: 0.28,
      serviceBreakdownAvailable: true,
    });

    expect(message.text).toBe("💰 SongQuiz AWS Cost");
    const json = JSON.stringify(message.blocks);
    expect(json).toContain("2026-08-27");
    expect(json).toContain("$2.14");
    expect(json).toContain("$31.72");
    expect(json).toContain("$48.20");
    expect(json).toContain("전일 적용 크레딧");
    expect(json).toContain("$10.22");
    expect(json).toContain("이번 달 적용 크레딧");
    expect(json).toContain("$102.20");
    expect(json).toContain("Amazon EC2");
    expect(json).toContain("기타: $0.28");
  });

  it("전일 비용 데이터가 아직 없으면 전일 크레딧 필드는 생략하고, 이번 달 크레딧은 표시한다", () => {
    const message = buildSlackMessage({
      reportDate: "2026-08-27",
      previousDayUsd: null,
      previousDayCreditUsd: 0,
      monthToDateUsd: 0,
      monthToDateCreditUsd: -5,
      monthForecastUsd: null,
      topServices: [],
      otherServicesUsd: 0,
      serviceBreakdownAvailable: true,
    });

    const json = JSON.stringify(message.blocks);
    expect(json).toContain("집계 중");
    expect(json).toContain("예측 불가");
    expect(json).not.toContain("전일 적용 크레딧");
    expect(json).toContain("이번 달 적용 크레딧");
    expect(json).toContain("$5.00");
  });

  it("크레딧이 없는 날은 $0.00으로 표시한다(음수가 아니라 절대값)", () => {
    const message = buildSlackMessage({
      reportDate: "2026-08-27",
      previousDayUsd: 1,
      previousDayCreditUsd: 0,
      monthToDateUsd: 1,
      monthToDateCreditUsd: 0,
      monthForecastUsd: null,
      topServices: [],
      otherServicesUsd: 0,
      serviceBreakdownAvailable: true,
    });

    const json = JSON.stringify(message.blocks);
    expect(json).not.toContain("-$0.00");
    expect(json).toContain("$0.00");
  });

  it("serviceBreakdownAvailable=false면 주요 서비스 섹션을 만들지 않는다", () => {
    const message = buildSlackMessage({
      reportDate: "2026-08-27",
      previousDayUsd: 2.14,
      previousDayCreditUsd: 0,
      monthToDateUsd: 31.72,
      monthToDateCreditUsd: 0,
      monthForecastUsd: null,
      topServices: [],
      otherServicesUsd: 0,
      serviceBreakdownAvailable: false,
    });

    const json = JSON.stringify(message.blocks);
    expect(json).not.toContain("주요 서비스");
  });

  it("기타 비용이 0이면 기타 줄을 표시하지 않는다", () => {
    const message = buildSlackMessage({
      reportDate: "2026-08-27",
      previousDayUsd: 0.82,
      previousDayCreditUsd: 0,
      monthToDateUsd: 0.82,
      monthToDateCreditUsd: 0,
      monthForecastUsd: null,
      topServices: [{ service: "Amazon EC2", amountUsd: 0.82 }],
      otherServicesUsd: 0,
      serviceBreakdownAvailable: true,
    });

    const json = JSON.stringify(message.blocks);
    expect(json).not.toContain("기타");
  });
});
