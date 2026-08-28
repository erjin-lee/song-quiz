export interface DailyCostEntry {
  date: string;
  amountUsd: number;
}

export interface DailyCostSummary {
  // reportDate에 해당하는 항목이 없으면 null - "$0.00"(실제로 비용이 없음)과 "아직 반영 안 됨"을
  // 구분하기 위함이다(§9 "데이터가 없는 경우").
  previousDayUsd: number | null;
  monthToDateUsd: number;
}

export function summarizeDailyCosts(
  entries: DailyCostEntry[],
  reportDate: string,
  monthStart: string,
): DailyCostSummary {
  let previousDayUsd: number | null = null;
  let monthToDateUsd = 0;

  for (const entry of entries) {
    if (entry.date === reportDate) {
      previousDayUsd = entry.amountUsd;
    }
    // 매달 1일에는 조회 범위에 지난달 마지막 날(reportDate)이 섞여 들어오므로(date-range.ts
    // getDailyCostsQueryStart 참고) monthStart 이후 날짜만 누적에 더한다.
    if (entry.date >= monthStart) {
      monthToDateUsd += entry.amountUsd;
    }
  }

  return { previousDayUsd, monthToDateUsd };
}
