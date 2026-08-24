import { SlackMessage } from "./slack/build-ai-analysis-message";

// alarm-notifier(apps/lambda/alarm-notifier/src/send-slack-message.ts)와 동일하게
// Node.js 관리형 런타임에 내장된 전역 fetch를 그대로 쓴다 - 별도 HTTP client
// dependency를 추가하지 않는다.
export async function sendSlackMessage(
  webhookUrl: string,
  message: SlackMessage,
): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
  });

  if (!response.ok) {
    // Webhook URL 자체는 절대 로그에 남기지 않는다 - status만 남긴다.
    throw new Error(
      `Slack webhook request failed with status ${response.status}`,
    );
  }
}
