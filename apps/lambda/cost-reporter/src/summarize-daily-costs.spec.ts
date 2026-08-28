import { summarizeDailyCosts } from "./summarize-daily-costs";

describe("summarizeDailyCosts", () => {
  it("reportDate에 해당하는 항목을 전일 비용으로, monthStart 이후 합을 이번 달 누적으로 계산한다", () => {
    const result = summarizeDailyCosts(
      [
        { date: "2026-08-01", amountUsd: 1.1 },
        { date: "2026-08-26", amountUsd: 2.2 },
        { date: "2026-08-27", amountUsd: 2.14 },
      ],
      "2026-08-27",
      "2026-08-01",
    );

    expect(result.previousDayUsd).toBe(2.14);
    expect(result.monthToDateUsd).toBeCloseTo(5.44);
  });

  it("매달 1일: monthStart 이전(지난달 마지막 날) 비용은 누적에서 제외하지만 전일 비용에는 포함한다", () => {
    const result = summarizeDailyCosts(
      [{ date: "2026-08-31", amountUsd: 3.5 }],
      "2026-08-31",
      "2026-09-01",
    );

    expect(result.previousDayUsd).toBe(3.5);
    expect(result.monthToDateUsd).toBe(0);
  });

  it("reportDate 데이터가 아직 반영되지 않은 경우 previousDayUsd는 null이다", () => {
    const result = summarizeDailyCosts(
      [{ date: "2026-08-26", amountUsd: 2.2 }],
      "2026-08-27",
      "2026-08-01",
    );

    expect(result.previousDayUsd).toBeNull();
    expect(result.monthToDateUsd).toBeCloseTo(2.2);
  });

  it("데이터가 아예 없는 경우 전일 비용은 null, 누적은 0이다", () => {
    const result = summarizeDailyCosts([], "2026-08-27", "2026-08-01");

    expect(result.previousDayUsd).toBeNull();
    expect(result.monthToDateUsd).toBe(0);
  });
});
