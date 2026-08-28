import { GetCostAndUsageCommand } from "@aws-sdk/client-cost-explorer";
import { costExplorerClient } from "./cost-explorer-client";
import { ServiceCostEntry } from "./build-top-services";

// date(전일) 하루치만 SERVICE 차원으로 그룹핑해서 조회한다 - Top N 서비스 계산은 "어제"
// 기준으로만 의미가 있어(§4), 이번 달 전체를 그룹핑하지 않는다(Cost Explorer 호출 비용/응답
// 크기도 줄어든다, README "예상 추가 비용" 참고).
export async function fetchServiceCosts(
  date: string,
  nextDate: string,
): Promise<ServiceCostEntry[]> {
  const response = await costExplorerClient.send(
    new GetCostAndUsageCommand({
      TimePeriod: { Start: date, End: nextDate },
      Granularity: "DAILY",
      Metrics: ["UnblendedCost"],
      GroupBy: [{ Type: "DIMENSION", Key: "SERVICE" }],
    }),
  );

  const groups = response.ResultsByTime?.[0]?.Groups ?? [];

  return groups.map((group) => ({
    service: group.Keys?.[0] ?? "Unknown",
    amountUsd: Number(group.Metrics?.UnblendedCost?.Amount ?? "0"),
  }));
}
