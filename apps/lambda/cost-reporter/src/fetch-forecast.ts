import { GetCostForecastCommand } from "@aws-sdk/client-cost-explorer";
import { costExplorerClient } from "./cost-explorer-client";

// 오늘부터 이번 달 말까지 "남은 기간"의 예상 비용만 예측한다(GetCostForecast는 과거를
// 예측할 수 없어 Start가 항상 오늘 이후여야 한다) - "이번 달 예상 비용"은 handler에서
// 이미 확정된 이번 달 누적과 이 값을 더해서 계산한다(compute-month-forecast.ts 참고).
export async function fetchForecastRemainderUsd(
  start: string,
  end: string,
): Promise<number> {
  const response = await costExplorerClient.send(
    new GetCostForecastCommand({
      TimePeriod: { Start: start, End: end },
      Metric: "UNBLENDED_COST",
      Granularity: "MONTHLY",
    }),
  );

  return Number(response.Total?.Amount ?? "0");
}
