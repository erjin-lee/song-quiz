import { getReportDateRange, getDailyCostsQueryStart } from "./date-range";
import { fetchDailyCosts } from "./fetch-daily-costs";
import { summarizeDailyCosts } from "./summarize-daily-costs";
import { fetchServiceCosts } from "./fetch-service-costs";
import { buildTopServices, ServiceCostEntry } from "./build-top-services";
import { fetchForecastRemainderUsd } from "./fetch-forecast";
import { computeMonthForecastUsd } from "./compute-month-forecast";
import { buildSlackMessage } from "./build-slack-message";
import { getSlackWebhookUrl } from "./get-slack-webhook-url";
import { sendSlackMessage } from "./send-slack-message";

const SLACK_WEBHOOK_PARAMETER_NAME = process.env.SLACK_WEBHOOK_PARAMETER_NAME;
const TOP_N_SERVICES = 5;

// EventBridge Scheduler가 아무 payload 없이 호출한다(infra/terraform/modules/cost-reporter/
// scheduler.tf) - 이벤트 입력에 의존하지 않는다.
export async function handler(): Promise<void> {
  if (!SLACK_WEBHOOK_PARAMETER_NAME) {
    throw new Error(
      "SLACK_WEBHOOK_PARAMETER_NAME environment variable is not set",
    );
  }

  const range = getReportDateRange(new Date());

  // 전일 비용/이번 달 누적은 이 리포트의 핵심 정보라 실패하면 Lambda 자체를 실패시킨다
  // (Slack에 빈/틀린 리포트를 보내는 것보다 CloudWatch에 실패로 남기는 쪽이 낫다 - alarm-notifier의
  // Slack 전송 실패 처리와 동일한 태도).
  let dailySummary;
  try {
    const dailyCosts = await fetchDailyCosts(
      getDailyCostsQueryStart(range),
      range.rangeEnd,
    );
    dailySummary = summarizeDailyCosts(
      dailyCosts,
      range.reportDate,
      range.monthStart,
    );
  } catch (error) {
    console.error(
      JSON.stringify({ event: "cost_report_failed", stage: "daily_costs" }),
    );
    throw error;
  }

  // 서비스별 내역/예상 비용은 보조 정보다(§4 "가능하면") - 실패해도 핵심 정보(전일/누적)만으로
  // 리포트를 계속 보낸다(fail-open).
  let topServices: ServiceCostEntry[] = [];
  let otherServicesUsd = 0;
  let serviceBreakdownAvailable = false;
  try {
    const serviceCosts = await fetchServiceCosts(
      range.reportDate,
      range.rangeEnd,
    );
    const built = buildTopServices(serviceCosts, TOP_N_SERVICES);
    topServices = built.top;
    otherServicesUsd = built.otherUsd;
    serviceBreakdownAvailable = true;
  } catch {
    console.error(
      JSON.stringify({ event: "cost_report_service_breakdown_failed" }),
    );
  }

  let monthForecastUsd: number | null = null;
  try {
    const forecastRemainderUsd = await fetchForecastRemainderUsd(
      range.forecastStart,
      range.forecastEnd,
    );
    monthForecastUsd = computeMonthForecastUsd(
      dailySummary.monthToDateUsd,
      forecastRemainderUsd,
    );
  } catch {
    console.error(JSON.stringify({ event: "cost_report_forecast_failed" }));
  }

  const message = buildSlackMessage({
    reportDate: range.reportDate,
    previousDayUsd: dailySummary.previousDayUsd,
    previousDayCreditUsd: dailySummary.previousDayCreditUsd,
    monthToDateUsd: dailySummary.monthToDateUsd,
    monthToDateCreditUsd: dailySummary.monthToDateCreditUsd,
    monthForecastUsd,
    topServices,
    otherServicesUsd,
    serviceBreakdownAvailable,
  });

  try {
    const webhookUrl = await getSlackWebhookUrl(SLACK_WEBHOOK_PARAMETER_NAME);
    await sendSlackMessage(webhookUrl, message);
  } catch (error) {
    console.error(
      JSON.stringify({ event: "cost_report_failed", stage: "slack" }),
    );
    throw error;
  }

  console.log(
    JSON.stringify({
      event: "cost_report_sent",
      reportDate: range.reportDate,
      previousDayUsd: dailySummary.previousDayUsd,
      previousDayCreditUsd: dailySummary.previousDayCreditUsd,
      monthToDateUsd: dailySummary.monthToDateUsd,
      monthToDateCreditUsd: dailySummary.monthToDateCreditUsd,
      monthForecastUsd,
      serviceBreakdownAvailable,
    }),
  );
}
