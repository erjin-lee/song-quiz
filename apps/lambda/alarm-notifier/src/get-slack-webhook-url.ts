import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

// AWS Lambda Node.js 20.x 관리형 런타임은 AWS SDK v3를 이미 포함하고 있어, 이 워크스페이스의
// 배포 zip(dist/, tsc 산출물만)에는 @aws-sdk/client-ssm을 번들링하지 않는다 - package.json에서도
// devDependencies로만 선언한다(타입 체크/테스트 목적). 런타임에는 Lambda가 제공하는 버전이 쓰인다.
const ssmClient = new SSMClient({});

// Lambda execution environment가 warm 상태로 재사용되는 동안(같은 컨테이너에서의 다음 invocation)
// 이 모듈 스코프 변수가 그대로 남아있다 - 매 invocation마다 SSM을 호출하지 않기 위한 캐시.
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
