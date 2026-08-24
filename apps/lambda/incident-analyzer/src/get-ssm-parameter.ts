import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

// alarm-notifier(apps/lambda/alarm-notifier/src/get-slack-webhook-url.ts)와 동일한 이유로
// @aws-sdk/client-ssm은 devDependencies로만 선언한다 - Lambda Node.js 관리형 런타임이
// 이미 AWS SDK v3를 포함하고 있어 배포 zip에 번들링하지 않는다.
const ssmClient = new SSMClient({});

// Slack Webhook URL과 OpenAI API Key, 두 개의 SecureString을 이 Lambda가 조회하므로
// parameter 이름별로 캐시한다(warm invocation 사이 재사용).
const cache = new Map<string, string>();

export async function getSsmParameter(parameterName: string): Promise<string> {
  const cached = cache.get(parameterName);
  if (cached) {
    return cached;
  }

  const response = await ssmClient.send(
    new GetParameterCommand({ Name: parameterName, WithDecryption: true }),
  );
  const value = response.Parameter?.Value;
  if (!value) {
    throw new Error(`SSM parameter ${parameterName} has no value`);
  }

  cache.set(parameterName, value);
  return value;
}
