import { GetCostAndUsageCommand } from "@aws-sdk/client-cost-explorer";
import { costExplorerClient } from "./cost-explorer-client";
import { DailyRecordTypeCosts } from "./summarize-daily-costs";

// 비용 기준은 UnblendedCost를 쓴다 - RI/Savings Plans 할인/상각을 재배분하지 않고 청구서에
// 찍히는 실제 일별 비용에 가장 가까운 지표라, "전일/이번 달 실제로 얼마 나갔는지"를 보여주는
// 이 리포트의 목적에 맞다(README "비용 기준" 참고).
//
// RECORD_TYPE(Usage/Credit/Refund/Tax/Support 등)으로 그룹핑해서 조회한다 - 이렇게 하면 추가
// API 호출 없이 한 번의 GetCostAndUsage로 (1) 순비용(모든 RECORD_TYPE 합산 - 기존과 동일한
// "전일/이번 달 누적" 값) (2) 그중 Credit(프로모션/Free Tier 크레딧)이 상쇄한 금액을 함께 얻는다
// (README "크레딧까지 함께 보여주는 이유" 참고).
export async function fetchDailyCosts(
  start: string,
  end: string,
): Promise<DailyRecordTypeCosts[]> {
  const response = await costExplorerClient.send(
    new GetCostAndUsageCommand({
      TimePeriod: { Start: start, End: end },
      Granularity: "DAILY",
      Metrics: ["UnblendedCost"],
      GroupBy: [{ Type: "DIMENSION", Key: "RECORD_TYPE" }],
    }),
  );

  return (response.ResultsByTime ?? []).map((result) => ({
    date: result.TimePeriod?.Start ?? "",
    recordTypeAmounts: (result.Groups ?? []).map((group) => ({
      recordType: group.Keys?.[0] ?? "Unknown",
      amountUsd: Number(group.Metrics?.UnblendedCost?.Amount ?? "0"),
    })),
  }));
}
