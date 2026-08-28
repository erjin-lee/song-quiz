import { buildSlackMessage } from "./build-slack-message";

describe("buildSlackMessage", () => {
  it("정상 리포트: 기준일/전일/누적/예상 비용과 서비스 Top N + 기타를 포함한다", () => {
    const message = buildSlackMessage({
      reportDate: "2026-08-27",
      previousDayUsd: 2.14,
      monthToDateUsd: 31.72,
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
    expect(json).toContain("Amazon EC2");
    expect(json).toContain("기타: $0.28");
  });

  it("전일 비용 데이터가 아직 없으면 집계 중 문구를, 예측 실패는 예측 불가 문구를 표시한다", () => {
    const message = buildSlackMessage({
      reportDate: "2026-08-27",
      previousDayUsd: null,
      monthToDateUsd: 0,
      monthForecastUsd: null,
      topServices: [],
      otherServicesUsd: 0,
      serviceBreakdownAvailable: true,
    });

    const json = JSON.stringify(message.blocks);
    expect(json).toContain("집계 중");
    expect(json).toContain("예측 불가");
  });

  it("serviceBreakdownAvailable=false면 주요 서비스 섹션을 만들지 않는다", () => {
    const message = buildSlackMessage({
      reportDate: "2026-08-27",
      previousDayUsd: 2.14,
      monthToDateUsd: 31.72,
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
      monthToDateUsd: 0.82,
      monthForecastUsd: null,
      topServices: [{ service: "Amazon EC2", amountUsd: 0.82 }],
      otherServicesUsd: 0,
      serviceBreakdownAvailable: true,
    });

    const json = JSON.stringify(message.blocks);
    expect(json).not.toContain("기타");
  });
});
