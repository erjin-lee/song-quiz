import { formatUsd } from "./format-usd";
import { ServiceCostEntry } from "./build-top-services";

export interface SlackMessage {
  text: string;
  blocks: unknown[];
}

export interface CostReport {
  reportDate: string;
  previousDayUsd: number | null;
  // RECORD_TYPE="Credit"만 합산한 값(음수 또는 0) - AWS Cost Explorer 콘솔의 기본 "비용 및
  // 사용량 그래프"는 이 크레딧을 뺀 원가(raw usage)를 보여줘서 이 리포트의 순비용과 다르게
  // 보일 수 있다. 그 차이를 바로 확인할 수 있도록 순비용 옆에 함께 표시한다.
  previousDayCreditUsd: number;
  monthToDateUsd: number;
  monthToDateCreditUsd: number;
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
      text: `*전일 비용(순)*\n${
        report.previousDayUsd === null
          ? NO_DATA_TEXT
          : formatUsd(report.previousDayUsd)
      }`,
    },
    {
      type: "mrkdwn",
      text: `*이번 달 누적(순)*\n${formatUsd(report.monthToDateUsd)}`,
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

  // "순비용" 옆에 상쇄된 크레딧을 함께 보여준다 - previousDayUsd가 null(데이터 미반영)이면
  // 그 날 크레딧 값도 의미가 없어 함께 생략한다.
  if (report.previousDayUsd !== null) {
    fields.push({
      type: "mrkdwn",
      text: `*전일 적용 크레딧*\n${formatUsd(Math.abs(report.previousDayCreditUsd))}`,
    });
  }
  fields.push({
    type: "mrkdwn",
    text: `*이번 달 적용 크레딧*\n${formatUsd(Math.abs(report.monthToDateCreditUsd))}`,
  });

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
        text: 'AWS Cost Explorer 데이터는 최대 몇 시간 지연/조정될 수 있어 위 금액이 완전히 확정된 값은 아닐 수 있습니다. "(순)" 표시된 금액은 크레딧이 이미 반영된 실제 청구 기준 금액입니다 - AWS 콘솔의 기본 비용 그래프는 크레딧 반영 전 금액을 보여줄 수 있어 다르게 보일 수 있습니다.',
      },
    ],
  });

  return { text: headerText, blocks };
}
