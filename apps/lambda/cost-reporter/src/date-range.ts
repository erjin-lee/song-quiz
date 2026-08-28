export interface ReportDateRange {
  // "전일"(Cost Explorer의 UTC 날짜 단위 그대로 - README "Cost Explorer 날짜 기준" 참고)
  reportDate: string;
  // 이번 달 1일(UTC)
  monthStart: string;
  // Cost Explorer TimePeriod.End는 exclusive라 "오늘"(UTC) = reportDate + 1일
  rangeEnd: string;
  // GetCostForecast는 과거를 예측할 수 없어 Start를 항상 "오늘"로 둔다
  forecastStart: string;
  // 다음 달 1일(UTC) - forecastStart~forecastEnd가 "이번 달 남은 기간"이 된다
  forecastEnd: string;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Cost Explorer는 UTC 기준으로 날짜를 집계한다 - KST 자정 기준으로 재구성하지 않고 그대로
// 쓴다(README "Cost Explorer 데이터 기준" 참고). 이 Lambda는 매일 10:00 Asia/Seoul(=01:00 UTC)에
// 실행되도록 스케줄되어 있어(infra/terraform/modules/cost-reporter), 그 시점의 UTC 날짜는
// 이미 KST 기준 "어제"의 다음 날로 넘어가 있다 - now를 UTC 자정 기준으로 하루만 되돌리면
// KST 기준 "어제"와 항상 일치한다. 스케줄 시각을 UTC 자정(=09:00 KST) 이전으로 옮기면 이
// 전제가 깨지므로 함께 조정해야 한다.
export function getReportDateRange(now: Date): ReportDateRange {
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const yesterday = new Date(today);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const monthStart = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1),
  );
  const nextMonthStart = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1),
  );

  return {
    reportDate: toIsoDate(yesterday),
    monthStart: toIsoDate(monthStart),
    rangeEnd: toIsoDate(today),
    forecastStart: toIsoDate(today),
    forecastEnd: toIsoDate(nextMonthStart),
  };
}

// 매달 1일에는 reportDate(어제 = 지난달 마지막 날)가 monthStart보다 앞선다 - "이번 달 누적"
// 쿼리 범위(monthStart~rangeEnd)만으로는 어제 비용을 못 가져오므로, 두 날짜 중 이른 쪽부터
// 조회해서 한 번의 Cost Explorer 호출로 "전일 비용"과 "이번 달 누적"을 모두 얻는다
// (summarizeDailyCosts가 reportDate/monthStart 기준으로 각각 다시 골라낸다).
export function getDailyCostsQueryStart(range: ReportDateRange): string {
  return range.reportDate < range.monthStart
    ? range.reportDate
    : range.monthStart;
}
