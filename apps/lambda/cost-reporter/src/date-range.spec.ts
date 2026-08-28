import { getReportDateRange, getDailyCostsQueryStart } from "./date-range";

describe("getReportDateRange", () => {
  it("월 중간 날짜는 전일/이번 달 1일/오늘/다음 달 1일을 UTC 기준으로 계산한다", () => {
    // 2026-08-28T01:00:00Z (10:00 Asia/Seoul)에 실행된 경우
    const now = new Date("2026-08-28T01:00:00.000Z");

    expect(getReportDateRange(now)).toEqual({
      reportDate: "2026-08-27",
      monthStart: "2026-08-01",
      rangeEnd: "2026-08-28",
      forecastStart: "2026-08-28",
      forecastEnd: "2026-09-01",
    });
  });

  it("매달 1일에는 reportDate(어제)가 monthStart보다 앞선 지난달 마지막 날이 된다", () => {
    // 2026-09-01T01:00:00Z(10:00 Asia/Seoul)에 실행된 경우
    const now = new Date("2026-09-01T01:00:00.000Z");

    expect(getReportDateRange(now)).toEqual({
      reportDate: "2026-08-31",
      monthStart: "2026-09-01",
      rangeEnd: "2026-09-01",
      forecastStart: "2026-09-01",
      forecastEnd: "2026-10-01",
    });
  });

  it("12월 -> 1월로 연도가 바뀌어도 forecastEnd(다음 달 1일)를 올바르게 계산한다", () => {
    const now = new Date("2026-12-15T01:00:00.000Z");

    expect(getReportDateRange(now).forecastEnd).toBe("2027-01-01");
  });
});

describe("getDailyCostsQueryStart", () => {
  it("평소에는 monthStart부터 조회한다(reportDate가 이번 달 안에 있음)", () => {
    const range = getReportDateRange(new Date("2026-08-28T01:00:00.000Z"));
    expect(getDailyCostsQueryStart(range)).toBe("2026-08-01");
  });

  it("매달 1일에는 reportDate(지난달 마지막 날)부터 조회한다", () => {
    const range = getReportDateRange(new Date("2026-09-01T01:00:00.000Z"));
    expect(getDailyCostsQueryStart(range)).toBe("2026-08-31");
  });
});
