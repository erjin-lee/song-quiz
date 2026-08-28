import { GetCostAndUsageCommand } from "@aws-sdk/client-cost-explorer";
import { costExplorerClient } from "./cost-explorer-client";
import { DailyCostEntry } from "./summarize-daily-costs";

// 비용 기준은 UnblendedCost를 쓴다 - RI/Savings Plans 할인/상각을 재배분하지 않고 청구서에
// 찍히는 실제 일별 비용에 가장 가까운 지표라, "전일/이번 달 실제로 얼마 나갔는지"를 보여주는
// 이 리포트의 목적에 맞다(README "비용 기준" 참고).
export async function fetchDailyCosts(
  start: string,
  end: string,
): Promise<DailyCostEntry[]> {
  const response = await costExplorerClient.send(
    new GetCostAndUsageCommand({
      TimePeriod: { Start: start, End: end },
      Granularity: "DAILY",
      Metrics: ["UnblendedCost"],
    }),
  );

  return (response.ResultsByTime ?? []).map((result) => ({
    date: result.TimePeriod?.Start ?? "",
    amountUsd: Number(result.Total?.UnblendedCost?.Amount ?? "0"),
  }));
}
