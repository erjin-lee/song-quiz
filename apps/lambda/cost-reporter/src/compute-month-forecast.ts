// GetCostForecast는 미래(오늘 이후)만 예측할 수 있어, "이번 달 예상 비용"은 이미 확정된
// 이번 달 누적(monthToDateUsd) + 오늘부터 월말까지의 예측치(forecastRemainderUsd)를 더해서
// 만든다. forecastRemainderUsd가 null이면(호출 실패, fail-open) 예측 자체를 표시하지 않는다.
export function computeMonthForecastUsd(
  monthToDateUsd: number,
  forecastRemainderUsd: number | null,
): number | null {
  if (forecastRemainderUsd === null) {
    return null;
  }

  return monthToDateUsd + forecastRemainderUsd;
}
