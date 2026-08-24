import { AnalysisResult, Confidence } from "../openai/schema";

export interface SlackMessage {
  text: string;
  blocks: unknown[];
}

const CONFIDENCE_EMOJI: Record<Confidence, string> = {
  HIGH: "🔴",
  MEDIUM: "🟡",
  LOW: "⚪",
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

/**
 * AI가 생성한 텍스트를 Slack payload로 그대로 쓰지 않는다(§24) - 구조화된
 * AnalysisResult를 받아 여기서 Block Kit으로 formatting한다.
 */
export function buildAiAnalysisMessage(
  alarmName: string,
  service: string,
  result: AnalysisResult,
): SlackMessage {
  const headerText = "🤖 [AI INCIDENT ANALYSIS]";

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

  return { text: headerText, blocks };
}
