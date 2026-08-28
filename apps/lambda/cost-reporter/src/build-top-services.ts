export interface ServiceCostEntry {
  service: string;
  amountUsd: number;
}

export interface TopServicesResult {
  top: ServiceCostEntry[];
  otherUsd: number;
}

// Top N을 넘는 나머지(비용이 0이거나 아주 작은 서비스 포함)는 개별로 나열하지 않고 "기타"
// 합계 하나로 접는다(§4) - top + otherUsd를 더하면 항상 entries 전체 합과 같다.
export function buildTopServices(
  entries: ServiceCostEntry[],
  topN: number,
): TopServicesResult {
  const sorted = [...entries].sort((a, b) => b.amountUsd - a.amountUsd);
  const top = sorted.slice(0, topN);
  const otherUsd = sorted
    .slice(topN)
    .reduce((sum, entry) => sum + entry.amountUsd, 0);

  return { top, otherUsd };
}
