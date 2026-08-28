export interface RecordTypeAmount {
  // Cost Explorer RECORD_TYPE 차원 값("Usage"/"Credit"/"Refund"/"Tax"/"Support" 등).
  recordType: string;
  amountUsd: number;
}

export interface DailyRecordTypeCosts {
  date: string;
  // Cost Explorer가 그 날짜에 대해 항상 하나씩 돌려주는 버킷이므로(요청한 날짜 범위만큼 항상
  // 존재), 그 날 비용이 정확히 0이면 빈 배열이 된다 - reportDate 자체가 결과에 없는 경우(§9
  // "데이터가 없는 경우")와 구분하기 위해 날짜 단위 존재 여부를 fetch-daily-costs.ts가 그대로
  // 보존해서 넘긴다.
  recordTypeAmounts: RecordTypeAmount[];
}

export interface DailyCostSummary {
  // reportDate에 해당하는 버킷 자체가 없으면 null - "$0.00"(실제로 비용이 없음)과 "아직 반영
  // 안 됨"을 구분하기 위함이다(§9 "데이터가 없는 경우").
  previousDayUsd: number | null;
  monthToDateUsd: number;
  // RECORD_TYPE="Credit"만 합산한 값(음수 또는 0) - AWS가 자동 적용한 프로모션/Free Tier
  // 크레딧이 실제 사용료(Usage)를 얼마나 상쇄했는지 보여준다. previousDayUsd가 null이면
  // (그 날 자체가 아직 반영 안 됨) 이 값도 의미가 없어 0으로 둔다.
  previousDayCreditUsd: number;
  monthToDateCreditUsd: number;
}

function sumRecordTypeAmounts(amounts: RecordTypeAmount[]): number {
  return amounts.reduce((sum, entry) => sum + entry.amountUsd, 0);
}

function sumCreditAmount(amounts: RecordTypeAmount[]): number {
  return amounts
    .filter((entry) => entry.recordType === "Credit")
    .reduce((sum, entry) => sum + entry.amountUsd, 0);
}

export function summarizeDailyCosts(
  days: DailyRecordTypeCosts[],
  reportDate: string,
  monthStart: string,
): DailyCostSummary {
  let previousDayUsd: number | null = null;
  let previousDayCreditUsd = 0;
  let monthToDateUsd = 0;
  let monthToDateCreditUsd = 0;

  for (const day of days) {
    if (day.date === reportDate) {
      previousDayUsd = sumRecordTypeAmounts(day.recordTypeAmounts);
      previousDayCreditUsd = sumCreditAmount(day.recordTypeAmounts);
    }
    // 매달 1일에는 조회 범위에 지난달 마지막 날(reportDate)이 섞여 들어오므로(date-range.ts
    // getDailyCostsQueryStart 참고) monthStart 이후 날짜만 누적에 더한다.
    if (day.date >= monthStart) {
      monthToDateUsd += sumRecordTypeAmounts(day.recordTypeAmounts);
      monthToDateCreditUsd += sumCreditAmount(day.recordTypeAmounts);
    }
  }

  return {
    previousDayUsd,
    monthToDateUsd,
    previousDayCreditUsd,
    monthToDateCreditUsd,
  };
}
