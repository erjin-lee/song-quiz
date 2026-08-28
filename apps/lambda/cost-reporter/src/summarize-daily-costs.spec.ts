import { summarizeDailyCosts } from "./summarize-daily-costs";

describe("summarizeDailyCosts", () => {
  it("reportDate 버킷의 RECORD_TYPE 합을 전일 비용으로, monthStart 이후 합을 이번 달 누적으로 계산한다", () => {
    const result = summarizeDailyCosts(
      [
        {
          date: "2026-08-01",
          recordTypeAmounts: [{ recordType: "Usage", amountUsd: 1.1 }],
        },
        {
          date: "2026-08-26",
          recordTypeAmounts: [{ recordType: "Usage", amountUsd: 2.2 }],
        },
        {
          date: "2026-08-27",
          recordTypeAmounts: [
            { recordType: "Usage", amountUsd: 10.22 },
            { recordType: "Credit", amountUsd: -10.22 },
          ],
        },
      ],
      "2026-08-27",
      "2026-08-01",
    );

    expect(result.previousDayUsd).toBeCloseTo(0);
    expect(result.previousDayCreditUsd).toBeCloseTo(-10.22);
    expect(result.monthToDateUsd).toBeCloseTo(3.3);
    expect(result.monthToDateCreditUsd).toBeCloseTo(-10.22);
  });

  it("그 날 비용이 정확히 0(빈 recordTypeAmounts)이면 전일 비용은 0, 크레딧은 0이다", () => {
    const result = summarizeDailyCosts(
      [{ date: "2026-08-27", recordTypeAmounts: [] }],
      "2026-08-27",
      "2026-08-01",
    );

    expect(result.previousDayUsd).toBe(0);
    expect(result.previousDayCreditUsd).toBe(0);
  });

  it("매달 1일: monthStart 이전(지난달 마지막 날) 비용은 누적에서 제외하지만 전일 비용에는 포함한다", () => {
    const result = summarizeDailyCosts(
      [
        {
          date: "2026-08-31",
          recordTypeAmounts: [{ recordType: "Usage", amountUsd: 3.5 }],
        },
      ],
      "2026-08-31",
      "2026-09-01",
    );

    expect(result.previousDayUsd).toBe(3.5);
    expect(result.monthToDateUsd).toBe(0);
  });

  it("reportDate 버킷 자체가 결과에 없으면(데이터 미반영) previousDayUsd는 null이다", () => {
    const result = summarizeDailyCosts(
      [
        {
          date: "2026-08-26",
          recordTypeAmounts: [{ recordType: "Usage", amountUsd: 2.2 }],
        },
      ],
      "2026-08-27",
      "2026-08-01",
    );

    expect(result.previousDayUsd).toBeNull();
    expect(result.previousDayCreditUsd).toBe(0);
    expect(result.monthToDateUsd).toBeCloseTo(2.2);
  });

  it("데이터가 아예 없는 경우 전일 비용은 null, 누적은 0이다", () => {
    const result = summarizeDailyCosts([], "2026-08-27", "2026-08-01");

    expect(result.previousDayUsd).toBeNull();
    expect(result.monthToDateUsd).toBe(0);
    expect(result.monthToDateCreditUsd).toBe(0);
  });
});
