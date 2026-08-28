import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

// alarm-notifier(apps/lambda/alarm-notifier/src/get-slack-webhook-url.ts)와 동일한 코드다.
// 공유 패키지 대신 Lambda마다 독립적으로 코드를 두는 이 저장소 컨벤션(apps/lambda/CLAUDE.md
// "하나가 실패/지연되어도 다른 하나에는 영향이 없다")을 따라 그대로 복제했다.
const ssmClient = new SSMClient({});

let cachedWebhookUrl: string | undefined;

export async function getSlackWebhookUrl(
  parameterName: string,
): Promise<string> {
  if (cachedWebhookUrl) {
    return cachedWebhookUrl;
  }

  const response = await ssmClient.send(
    new GetParameterCommand({ Name: parameterName, WithDecryption: true }),
  );
  const value = response.Parameter?.Value;
  if (!value) {
    throw new Error(`SSM parameter ${parameterName} has no value`);
  }

  cachedWebhookUrl = value;
  return cachedWebhookUrl;
}
