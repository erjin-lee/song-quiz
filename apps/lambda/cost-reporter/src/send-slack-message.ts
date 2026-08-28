import { SlackMessage } from "./build-slack-message";

// alarm-notifier(apps/lambda/alarm-notifier/src/send-slack-message.ts)와 동일한 코드다.
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
    throw new Error(
      `Slack webhook request failed with status ${response.status}`,
    );
  }
}
