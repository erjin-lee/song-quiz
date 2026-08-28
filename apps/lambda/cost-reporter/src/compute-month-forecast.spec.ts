import { computeMonthForecastUsd } from "./compute-month-forecast";

describe("computeMonthForecastUsd", () => {
  it("이번 달 누적 + 남은 기간 예측치를 더한다", () => {
    expect(computeMonthForecastUsd(31.72, 16.48)).toBeCloseTo(48.2);
  });

  it("forecastRemainderUsd가 null이면(조회 실패) null을 반환한다", () => {
    expect(computeMonthForecastUsd(31.72, null)).toBeNull();
  });
});
