# cost-reporter

SongQuiz AWS 인프라 비용을 추적하는 FinOps v1의 일부다. 매일 전일 AWS 비용을 Cost Explorer에서
조회해 Slack Incoming Webhook으로 전달하는 Lambda로, Terraform 정의는
[`infra/terraform/modules/cost-reporter/`](../../../infra/terraform/modules/cost-reporter)에 있다.

```text
EventBridge Scheduler(매일 10:00 Asia/Seoul)
  -> 이 Lambda
     -> Cost Explorer GetCostAndUsage(전일 비용 + 이번 달 누적, 서비스별 Top N)
     -> Cost Explorer GetCostForecast(이번 달 남은 기간 예상 비용, 실패해도 나머지는 계속 진행)
     -> SSM(Slack Webhook - alarm-notifier와 동일 파라미터 재사용)
  -> Slack Incoming Webhook
```

FinOps v1의 나머지 부분(공통 Cost Allocation Tag, Monthly Budget, Cost Anomaly Detection)은
Lambda가 없는 계정 청구(Billing) 단위 리소스라 이 워크스페이스가 아니라
[`infra/terraform/modules/finops/`](../../../infra/terraform/modules/finops)에서 관리한다.
이 Lambda가 실패해도 Budget/Anomaly Detection 알림에는 영향이 없고, 반대도 마찬가지다 -
서로 참조하지 않는 독립된 경로다.

NestJS/Express 없이 plain Lambda handler(`src/handler.ts`)만 사용한다. `@aws-sdk/*`는
devDependencies로만 선언되어 있다 - Lambda Node.js 관리형 런타임이 AWS SDK v3를 이미 제공하므로
배포 zip(`dist/`)에는 번들링하지 않는다(alarm-notifier와 동일한 컨벤션).

## FinOps v1 전체 구조

| 구성 요소 | 무엇을 하는가 | Terraform |
|---|---|---|
| Cost Allocation Tag | 모든 리소스에 `Project`/`Environment`/`ManagedBy`를 자동으로 붙이고(provider `default_tags`), EC2/ALB/RDS/ElastiCache/NAT처럼 api/game이 함께 쓰는 리소스에 `Service = shared`를, apps/web 전용 리소스에 `Service = web`을 붙인다 | `environments/{prod,bootstrap}/providers.tf`, 각 모듈의 `tags` |
| Monthly Budget | 이번 달 실제/예상 비용이 설정한 한도의 50/80/100%(실제)·80/100%(예상)를 넘으면 이메일로 알린다 | `modules/finops/budget.tf` |
| Cost Anomaly Detection | 계정 전체 AWS 서비스 비용을 매일 관찰하다가, 과거 지출 패턴 대비 비정상적으로 튄 비용(절대값 기준)이 있으면 이메일로 알린다 | `modules/finops/anomaly-detection.tf` |
| Cost Reporter(이 워크스페이스) | 그날그날의 실제 지출 현황을 매일 한 번 요약해서 Slack으로 보여준다 | `modules/cost-reporter/` |

### Budget과 Cost Anomaly Detection의 차이

Budget은 **정해둔 한도**(`monthly_budget_usd`) 대비 얼마나 왔는지를 본다 - 평소보다 비용이
늘었어도 한도 밖이면 알리지 않는다. Cost Anomaly Detection은 **평소 지출 패턴 대비 비정상적인
증가**를 AWS가 자체 학습한 기준으로 잡아낸다 - 아직 월 Budget 한도에 한참 못 미쳐도, 어제 갑자기
평소보다 훨씬 많이 나왔다면 알린다. 즉 Budget이 "한도 도달"을, Anomaly Detection이 "평소와 다른
변화"를 감지한다 - 둘 다 필요하고 서로 대체할 수 없다.

### Cost Allocation Tag 활성화 방법(Terraform으로 되는 범위 vs 콘솔에서 직접 할 일)

Terraform이 하는 일은 리소스에 태그를 **붙이는 것**까지다. 그 태그를 AWS Billing/Cost Explorer의
"Cost Allocation Tags"에서 **비용 분석에 실제로 쓰이게(활성화)** 하는 것은 AWS 콘솔에서 사람이
한 번 해줘야 하는 별도 단계다(Terraform으로 자동화할 수 있는 API가 없다):

1. `terraform apply`로 태그를 실제 리소스에 반영한다(아래 "최초 배포 순서" 참고).
2. 태그가 붙은 리소스가 있는 상태로 AWS Billing and Cost Management 콘솔 >
   [Cost allocation tags](https://us-east-1.console.aws.amazon.com/costmanagement/home#/tags)로
   이동한다.
3. `Project`/`Environment`/`ManagedBy`/`Service`가 "User-defined cost allocation tags" 목록에
   나타나면 체크하고 **Activate**한다. (막 붙인 태그는 목록에 나타나기까지 최대 24시간 걸릴 수 있다.)
4. 활성화 후에도 Cost Explorer에 태그별 데이터가 반영되기까지 추가로 하루 정도 걸릴 수 있다 -
   이 Lambda의 서비스별 Top N은 태그가 아니라 AWS `SERVICE` 차원을 쓰므로 이 활성화 지연과
   무관하게 바로 동작한다.

## Cost Explorer 데이터 기준

- **비용 기준(`UnblendedCost`)**: RI/Savings Plans 할인이나 상각을 재배분하지 않고 청구서에
  가장 가깝게 찍히는 실제 일별 비용이라, "어제/이번 달 실제로 얼마 나갔는지"를 보여주는 이
  리포트의 목적에 맞다. (참고로 Budget/Cost Anomaly Detection도 별도 설정이 없으면 AWS가 기본으로
  Unblended 기준 비용을 쓴다.)
- **날짜 기준**: Cost Explorer는 UTC 기준으로 날짜를 집계한다. 이 Lambda는 KST 자정 기준으로
  재구성하는 별도 aggregation을 만들지 않고 Cost Explorer의 날짜 단위 그대로 쓴다
  (`src/date-range.ts`). 매일 10:00 Asia/Seoul(=01:00 UTC)에 실행되도록 스케줄되어 있어, 그 시점의
  "UTC 어제"가 정확히 KST 기준 "어제"와 일치한다 - **스케줄 시각을 앞당기면(특히 09:00 KST
  이전) 이 전제가 깨지므로 함께 조정해야 한다.**
- **확정된 값이 아님**: AWS Cost Explorer의 일별 데이터는 최대 몇 시간~하루 정도 지연되거나 이후
  조정(refund, credit 반영 등)될 수 있다. Slack 메시지에도 "완전히 확정된 값이 아닐 수 있다"는
  문구를 항상 포함한다(`src/build-slack-message.ts`) - 절대 실시간 확정 값처럼 표현하지 않는다.

## 조회하는 정보

- 전일 비용, 이번 달 누적 비용: `GetCostAndUsage`(Granularity `DAILY`, GroupBy 없음) 한 번 호출로
  함께 얻는다 - 매달 1일에는 "어제"(지난달 마지막 날)가 "이번 달 1일"보다 앞서므로, 두 날짜 중
  이른 쪽부터 조회한 뒤(`getDailyCostsQueryStart`) `summarizeDailyCosts`가 각각 골라낸다.
- 서비스별 전일 비용 Top 5 + 기타: `GetCostAndUsage`(GroupBy `SERVICE`, 전일 하루만) 별도 호출.
  Top 5를 넘는 나머지는(비용이 0이거나 아주 작은 서비스 포함) 개별로 나열하지 않고 "기타" 합계
  하나로 접는다(`buildTopServices`).
- 이번 달 예상 비용: `GetCostForecast`(오늘부터 월말까지 "남은 기간"만 예측 - Forecast API는
  과거를 예측할 수 없다) + 이미 확정된 이번 달 누적을 더해서 계산한다(`computeMonthForecastUsd`).
  실패해도(권한/데이터 부족 등) 나머지 리포트는 그대로 보낸다(fail-open, 아래 "실패 처리" 참고).

## 실패 처리

| 실패 지점 | 처리 |
|---|---|
| 전일/누적 비용 조회(`GetCostAndUsage`, GroupBy 없음) | 리포트의 핵심 정보라 실패하면 Lambda를 실패시킨다(Slack 전송 자체를 하지 않음) |
| 서비스별 내역 조회(`GetCostAndUsage`, GroupBy SERVICE) | 보조 정보라 실패해도 fail-open - "주요 서비스" 섹션만 빠진 채로 나머지 리포트를 그대로 보낸다 |
| 예상 비용 조회(`GetCostForecast`) | 보조 정보라 실패해도 fail-open - "예측 불가"로 표시하고 나머지 리포트를 그대로 보낸다 |
| Slack 전송 | 실패하면 Lambda를 실패시킨다(alarm-notifier와 동일한 태도) |
| 전일 데이터가 아직 반영 안 됨 | 에러가 아니라 "집계 중(데이터 반영 지연)"으로 표시한다 - `$0.00`(실제로 비용 없음)과 구분한다 |

## 빌드

```bash
yarn workspace cost-reporter build
```

`dist/`에 `tsc` 산출물(JS만, `*.spec.ts`/`node_modules` 제외)이 생성된다. Terraform의
`data "archive_file"`이 이 `dist/`를 그대로 zip으로 묶으므로, **`terraform plan`/`apply` 전에
반드시 먼저 빌드해야 한다.**

## 코드 배포(CI 자동)

`apps/lambda/cost-reporter/**`가 바뀐 채로 `main`에 merge되면
[`deploy-cost-reporter.yml`](../../../.github/workflows/deploy-cost-reporter.yml)이 빌드 후
`aws lambda update-function-code`로 코드만 바로 배포한다 - 코드만 바뀐 경우엔 `terraform apply`가
필요 없다. 환경변수/IAM/스케줄 등 인프라 자체를 바꿀 때만 여전히 `terraform apply`(로컬, 수동)가
필요하다(`aws_lambda_function.cost_reporter`의 `lifecycle.ignore_changes`가 이 둘이 서로의 배포를
되돌리지 않도록 막는다).

이 워크플로우가 동작하려면 `infra/terraform/environments/bootstrap`에 정의된 `ci_deploy_lambda`
Role(alarm-notifier/incident-analyzer와 공유)이 이 함수의 ARN도 허용하도록 이미 갱신되어 있다
(`deploy-lambda.tf`) - **이 변경을 반영하려면 `bootstrap` root에서 `terraform apply`를 한 번
다시 해야 한다** (`apps/lambda/CLAUDE.md` "코드 배포(CI 자동)" 규칙과 동일한 맥락).

새 환경변수/IAM 권한을 요구하는 코드를 추가할 때는 `apps/lambda/CLAUDE.md`의 규칙을 따른다 - CI가
코드를 먼저 배포해도 `terraform apply` 전까지 이 Lambda의 기존 기능이 깨지지 않도록, 새 환경변수는
optional로 읽고 새 권한이 필요한 호출은 실패해도 fail-open으로 넘어가게 짠다.

## 테스트

```bash
yarn workspace cost-reporter test
```

Cost Explorer(`@aws-sdk/client-cost-explorer`)/SSM/Slack 전송은 전부 mock한다 - 실제 AWS/Slack
호출 없이 실행된다. 아래를 포함해 38개 테스트로 검증한다:

- Cost Explorer 결과 -> 전일 비용/이번 달 누적 변환(`summarize-daily-costs.spec.ts`)
- 서비스별 비용 정렬 및 Top N + 기타 처리(`build-top-services.spec.ts`)
- 데이터가 없는 경우(전일 데이터 미반영, 서비스 내역 없음)
- Cost Explorer 호출 실패 시 처리(핵심 정보는 실패시키고, 보조 정보는 fail-open)
- Slack 호출 실패 시 처리
- 비용 숫자 formatting(`format-usd.spec.ts`)

## 환경 변수

| 이름 | 필수 | 기본값 | 설명 |
|---|---|---|---|
| `SLACK_WEBHOOK_PARAMETER_NAME` | 예 | - | alarm-notifier/incident-analyzer와 동일한 Slack Webhook SSM Parameter 이름 |

## Slack Webhook

이 Lambda는 별도 Webhook을 새로 만들지 않고, alarm-notifier가 이미 등록해둔 SSM Parameter를
그대로 재사용한다(§5). 아직 등록하지 않았다면
[`alarm-notifier/README.md`](../alarm-notifier/README.md#slack-incoming-webhook-등록)를 따른다.

## Terraform Variables(신규)

| 변수 | 위치 | 필수 | 기본값 | 설명 |
|---|---|---|---|---|
| `monthly_budget_usd` | `environments/prod` | 예 | - | 월간 Budget 금액(USD). 민감하지는 않지만 환경별 값이라 기본값 없음 |
| `budget_alert_emails` | `environments/prod` | 예 | - | Budget/Cost Anomaly Detection 알림 이메일 목록. `sensitive = true` - `terraform.tfvars`(gitignore 대상)에만 채운다 |
| `cost_anomaly_threshold_usd` | `environments/prod` | 아니오 | `10` | Cost Anomaly Detection이 알림을 보낼 이상 비용 절대값 임계치(USD) |

`terraform.tfvars.example`에 형식 예시가 있다.

## 최초 배포 순서

새 리소스(Lambda/Budget/Anomaly Detection/EventBridge Scheduler)라 아래 순서를 지켜야 한다 -
특히 **CI가 코드를 배포할 함수 자체가 아직 없는 상태**에서 코드 배포 워크플로우가 먼저 도는
일이 없도록 주의한다(코드 배포는 "기존 함수의 코드만" 바꿀 수 있고 함수를 새로 만들지 못한다,
`environments/bootstrap/deploy-lambda.tf` 참고).

1. `apps/lambda/cost-reporter` 워크스페이스에서 `yarn workspace cost-reporter build`로 `dist/`를
   만든다.
2. `infra/terraform/environments/prod/terraform.tfvars`에 `monthly_budget_usd`/
   `budget_alert_emails`(필요하면 `cost_anomaly_threshold_usd`)를 채운다.
3. `infra/terraform/environments/prod`에서 `terraform plan` -> 결과 확인 후 `terraform apply` -
   Budget/Cost Anomaly Detection/Lambda/EventBridge Scheduler가 모두 이 apply 한 번으로 만들어진다.
4. `infra/terraform/environments/bootstrap`에서 `terraform apply` - `ci_deploy_lambda` Role이
   `song-quiz-prod-cost-reporter` 함수도 배포할 수 있도록 갱신한다.
5. 이후 `apps/lambda/cost-reporter/**` 변경은 3~4를 다시 하지 않아도 CI가 자동으로 코드만
   배포한다(위 "코드 배포(CI 자동)" 참고).
6. (선택) 위 "Cost Allocation Tag 활성화 방법"의 콘솔 단계를 진행한다.

## 실제 Slack 전송 테스트 방법

배포 없이 로컬에서 실제 AWS 계정의 Cost Explorer 데이터로 Slack까지 보내보고 싶다면(주의: 실제
Slack 채널에 메시지가 간다):

```bash
cd apps/lambda/cost-reporter
yarn build
node -e '
  process.env.SLACK_WEBHOOK_PARAMETER_NAME = "/song-quiz/prod/slack/alarm-webhook-url";
  require("./dist/handler").handler().then(() => console.log("sent")).catch((e) => { console.error(e); process.exit(1); });
'
```

로컬 실행 환경에 이 Parameter를 읽고(`ssm:GetParameter`) Cost Explorer를 조회할
(`ce:GetCostAndUsage`, `ce:GetCostForecast`) 수 있는 AWS 자격 증명이 있어야 한다(예:
`AWS_PROFILE=default`).

## Cost Reporter Lambda를 수동 invoke해서 검증하는 방법

배포 후 스케줄을 기다리지 않고 바로 검증한다:

```bash
aws lambda invoke \
  --function-name song-quiz-prod-cost-reporter \
  --cli-read-timeout 60 \
  /tmp/cost-reporter-output.json

cat /tmp/cost-reporter-output.json
```

정상이면 payload 없이 빈 응답(`{}`에 가까운 내용)이 오고 Slack에 💰 리포트가 도착한다. 실패하면
CloudWatch Console > Lambda > `song-quiz-prod-cost-reporter` > Monitor > Logs에서
`cost_report_sent`(성공) 또는 `cost_report_failed`(`stage: "daily_costs" | "slack"`, 핵심 정보
실패)를 확인한다. `cost_report_service_breakdown_failed`/`cost_report_forecast_failed`는
fail-open으로 처리된 보조 정보 실패라 리포트 자체는 정상 전송된 것이다.

EventBridge Scheduler 자체가 정상 동작하는지는 AWS 콘솔 EventBridge > Scheduler >
`song-quiz-prod-cost-reporter-daily`의 최근 실행 이력(Recent invocations)에서 확인할 수 있다.

## 예상 추가 비용

- **Lambda**: 하루 1회, 짧은 실행(수 초) - Free Tier 안에서 사실상 $0에 가깝다.
- **Cost Explorer API 호출**: `GetCostAndUsage` 2회 + `GetCostForecast` 1회 = 하루 3회
  (2026년 기준 요청당 약 $0.01) - 월 약 90회 * $0.01 ≈ **월 $0.9 내외**.
- **EventBridge Scheduler**: 이 사용량대(하루 1회 invocation)에서는 Free Tier 안에 들어온다.
- **Budget/Cost Anomaly Detection**: 계정당 무료(추가 과금 없음).

CUR/S3 Cost and Usage Report/Athena/QuickSight/장기 비용 데이터 저장/CloudWatch Custom
Metric으로 비용 복제 등은 이번 v1에서 의도적으로 만들지 않았다(§8) - 그만큼 이 리포트가 만드는
추가 비용도 최소한으로 유지된다.
