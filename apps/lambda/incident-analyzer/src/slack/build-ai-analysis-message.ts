import { DeploymentContext } from "../context/types";
import {
  AnalysisResult,
  Confidence,
  DeploymentRelevance,
} from "../openai/schema";

export interface SlackMessage {
  text: string;
  blocks: unknown[];
}

const CONFIDENCE_EMOJI: Record<Confidence, string> = {
  HIGH: "🔴",
  MEDIUM: "🟡",
  LOW: "⚪",
};

const RELEVANCE_EMOJI: Record<DeploymentRelevance, string> = {
  HIGH: "🔴",
  MEDIUM: "🟡",
  LOW: "⚪",
  NONE: "⚫",
};

function bulletList(items: string[], emptyText: string): string {
  return items.length > 0
    ? items.map((item) => `• ${item}`).join("\n")
    : emptyText;
}

function numberedList(items: string[], emptyText: string): string {
  return items.length > 0
    ? items.map((item, index) => `${index + 1}. ${item}`).join("\n")
    : emptyText;
}

function formatMinutesBeforeIncident(minutes?: number): string {
  if (minutes === undefined) {
    return "배포 시각 불명확";
  }
  return minutes >= 0
    ? `${minutes}분 전`
    : `Alarm ${Math.abs(minutes)}분 후(원인 아님)`;
}

/** 최근 Production Deployment를 서비스별 한 줄씩 표시한다(§25) - relevance가 NONE이면 호출하지 않는다. */
function buildRecentDeploymentText(deployments: DeploymentContext[]): string {
  return deployments
    .map((deployment) => {
      const serviceLabel = deployment.service === "api" ? "API" : "Game";
      const timeLabel = formatMinutesBeforeIncident(
        deployment.minutesBeforeIncident,
      );
      const prLine = deployment.pullRequest
        ? `PR #${deployment.pullRequest.number} · ${deployment.pullRequest.title}`
        : deployment.pullRequestLookup === "FAILED"
          ? "PR 조회 실패"
          : "연결된 PR 없음(direct push)";
      return `${serviceLabel} · ${timeLabel}\n${prLine}`;
    })
    .join("\n\n");
}

/**
 * AI가 생성한 텍스트를 Slack payload로 그대로 쓰지 않는다(§24) - 구조화된
 * AnalysisResult를 받아 여기서 Block Kit으로 formatting한다.
 */
export function buildAiAnalysisMessage(
  alarmName: string,
  service: string,
  result: AnalysisResult,
  deployments: DeploymentContext[],
): SlackMessage {
  const headerText = "🤖 [AI INCIDENT ANALYSIS]";
  const { relevance } = result.deploymentCorrelation;

  const blocks: unknown[] = [
    {
      type: "header",
      text: { type: "plain_text", text: headerText, emoji: true },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Alarm*\n${alarmName}` },
        { type: "mrkdwn", text: `*Service*\n${service}` },
      ],
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*Summary*\n${result.summary}` },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Probable Cause*\n${result.probableCause}`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Evidence*\n${bulletList(result.evidence, "없음")}`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Recommended Checks*\n${numberedList(result.recommendedChecks, "없음")}`,
      },
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Confidence*\n${CONFIDENCE_EMOJI[result.confidence]} ${result.confidence}`,
        },
        {
          type: "mrkdwn",
          text: `*Limitations*\n${bulletList(result.limitations, "없음")}`,
        },
      ],
    },
  ];

  // relevance가 NONE이면 배포 목록을 굳이 나열하지 않는다(§25) - Deployment Correlation
  // 필드 하나로 "확인했지만 관련 없음"을 투명하게만 보여준다.
  if (relevance !== "NONE" && deployments.length > 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Recent Deployment*\n${buildRecentDeploymentText(deployments)}`,
      },
    });
  }

  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*Deployment Correlation*\n${RELEVANCE_EMOJI[relevance]} ${relevance} - ${result.deploymentCorrelation.summary}`,
    },
  });

  return { text: headerText, blocks };
}
