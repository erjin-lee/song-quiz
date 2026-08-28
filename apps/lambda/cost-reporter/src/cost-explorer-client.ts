import { CostExplorerClient } from "@aws-sdk/client-cost-explorer";

// AWS Lambda Node.js 관리형 런타임은 AWS SDK v3를 이미 포함하고 있어, 이 워크스페이스의
// 배포 zip(dist/, tsc 산출물만)에는 @aws-sdk/client-cost-explorer를 번들링하지 않는다
// (package.json에서도 devDependencies로만 선언 - alarm-notifier와 동일한 이유).
//
// Cost Explorer는 리전별 서비스가 아니라 계정 전체를 다루는 글로벌 API라 항상 us-east-1
// 엔드포인트만 제공한다(AWS 문서 기준). region을 명시하지 않으면 SDK가 Lambda 실행 리전
// (AWS_REGION=ap-northeast-2)으로 클라이언트를 만들어 모든 호출이 실패하므로 반드시 고정한다.
export const costExplorerClient = new CostExplorerClient({
  region: "us-east-1",
});
