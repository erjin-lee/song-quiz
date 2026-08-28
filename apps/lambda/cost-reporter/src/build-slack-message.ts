import { formatUsd } from "./format-usd";
import { ServiceCostEntry } from "./build-top-services";

export interface SlackMessage {
  text: string;
  blocks: unknown[];
}

export interface CostReport {
  reportDate: string;
  previousDayUsd: number | null;
  monthToDateUsd: number;
  monthForecastUsd: number | null;
  topServices: ServiceCostEntry[];
  otherServicesUsd: number;
  // fetchServiceCosts 호출 자체가 실패하면(fail-open) false - 이 경우 "주요 서비스" 섹션을
  // 아예 표시하지 않는다("0건"과 "조회 실패"를 구분하기 위함).
  serviceBreakdownAvailable: boolean;
}

const NO_DATA_TEXT = "집계 중 (데이터 반영 지연)";
const FORECAST_UNAVAILABLE_TEXT = "예측 불가";

export function buildSlackMessage(report: CostReport): SlackMessage {
  const headerText = "💰 SongQuiz AWS Cost";

  const fields = [
    { type: "mrkdwn", text: `*기준일*\n${report.reportDate}` },
    {
      type: "mrkdwn",
      text: `*전일 비용*\n${
        report.previousDayUsd === null
          ? NO_DATA_TEXT
          : formatUsd(report.previousDayUsd)
      }`,
    },
    {
      type: "mrkdwn",
      text: `*이번 달 누적*\n${formatUsd(report.monthToDateUsd)}`,
    },
    {
      type: "mrkdwn",
      text: `*월 예상 비용*\n${
        report.monthForecastUsd === null
          ? FORECAST_UNAVAILABLE_TEXT
          : formatUsd(report.monthForecastUsd)
      }`,
    },
  ];

  const blocks: unknown[] = [
    {
      type: "header",
      text: { type: "plain_text", text: headerText, emoji: true },
    },
    { type: "section", fields },
  ];

  if (report.serviceBreakdownAvailable) {
    const serviceLines = report.topServices.map(
      (service) => `• ${service.service}: ${formatUsd(service.amountUsd)}`,
    );
    if (report.otherServicesUsd > 0) {
      serviceLines.push(`• 기타: ${formatUsd(report.otherServicesUsd)}`);
    }

    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          serviceLines.length > 0
            ? `*주요 서비스*\n${serviceLines.join("\n")}`
            : "*주요 서비스*\n집계된 비용 없음",
      },
    });
  }

  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: "AWS Cost Explorer 데이터는 최대 몇 시간 지연/조정될 수 있어 위 금액이 완전히 확정된 값은 아닐 수 있습니다.",
      },
    ],
  });

  return { text: headerText, blocks };
}
