# alarm-notifier

CloudWatch Alarm(`SongQuiz-Prod-*`)의 상태 변화(`ALARM`/`OK`)를 EventBridge로 받아 Slack Incoming
Webhook으로 전달하는 Lambda다. Terraform 정의는
[`infra/terraform/modules/notification/`](../../../infra/terraform/modules/notification)에 있다.

```text
CloudWatch Alarm -> EventBridge Rule -> 이 Lambda -> Slack Incoming Webhook
```

NestJS/Express 같은 프레임워크 없이 plain Lambda handler(`src/handler.ts`)만 사용한다.
`@aws-sdk/client-ssm`/`@aws-sdk/client-cloudwatch`는 devDependencies로만 선언되어 있다 -
Lambda Node.js 20.x 런타임이 AWS SDK v3를 기본 제공하므로 배포 zip(`dist/`)에는 번들링하지 않는다.

## QuizSnapshotFailure 복구 확인

`QuizSnapshotFailure` 알람(`RECOVERY_CONFIRM_ALARM_SIGNAL`, 기본값)이 `ALARM -> OK`로 전환되면,
곧바로 RECOVERED를 보내지 않고 `GameStartSuccess` Custom Metric
(`infra/terraform/modules/logging/metric-filters.tf`, `game_started` 이벤트 기반)으로 최근
`RECOVERY_CONFIRM_LOOKBACK_MINUTES`분(기본 10분) 동안 게임 시작이 `RECOVERY_CONFIRM_MIN_COUNT`회
(기본 5회) 이상 성공했는지 CloudWatch `GetMetricData`로 확인한다 (`src/get-recent-success-count.ts`).
기준에 못 미치면 그 전이에서는 Slack 메시지를 보내지 않는다(CloudWatch 콘솔상 알람 상태 자체는
그대로 OK로 표시된다 - 바뀌는 건 Slack 알림 시점뿐이다). 확인을 통과해 실제로 RECOVERED를 보낼
때는 확인된 성공 횟수를 `*최근 게임 시작 성공*` 필드로 메시지에 그대로 표시한다. 지표 조회
자체가 실패하면 fail open으로 그냥 RECOVERED를 보내되, 이 경우엔 확인된 값이 없으니 성공 횟수
필드는 표시하지 않는다. 다른 알람(예: `Target5xx`)은 이 확인 없이 기존처럼 즉시 알림이 간다.

수동 테스트(아래 "배포 후 수동 테스트")로 `QuizSnapshotFailure`를 OK로 강제 전환해도, 최근 10분간
실제 게임 시작이 5회 이상 없었다면 RECOVERED가 오지 않을 수 있다 - Lambda 로그의
`alarm_notification_skipped`(`reason: "recovery_not_confirmed"`)로 확인 가능하다.

## 빌드

```bash
yarn workspace alarm-notifier build
```

`dist/`에 `tsc` 산출물(JS만, `*.spec.ts`/`node_modules` 제외)이 생성된다. Terraform의
`data "archive_file"`이 이 `dist/`를 그대로 zip으로 묶으므로, **`terraform plan`/`apply` 전에
반드시 먼저 빌드해야 한다.**

## 코드 배포(CI 자동)

`apps/lambda/alarm-notifier/**`가 바뀐 채로 `main`에 merge되면
[`deploy-alarm-notifier.yml`](../../../.github/workflows/deploy-alarm-notifier.yml)이 빌드 후
`aws lambda update-function-code`로 코드만 바로 배포한다 - 코드만 바뀐 경우엔 `terraform apply`가
필요 없다. 환경변수/IAM/timeout 등 인프라 자체를 바꿀 때만 여전히 `terraform apply`(로컬, 수동)가
필요하다(`aws_lambda_function.alarm_notifier`의 `lifecycle.ignore_changes`가 이 둘이 서로의 배포를
되돌리지 않도록 막는다).

이 워크플로우가 동작하려면 `infra/terraform/environments/bootstrap`(로컬에서 직접 apply하는
root, CI 대상 아님)에 정의된 `aws_iam_role.ci_deploy_lambda`가 배포돼 있어야 한다. `terraform
apply` 후 출력되는 `ci_deploy_lambda_role_arn` 값을 GitHub 저장소 Variable
`CI_DEPLOY_LAMBDA_ROLE_ARN`에 등록해야 한다(`CI_DEPLOY_METADATA_ROLE_ARN`을 이미 등록한 것과
동일한 절차).

**새 환경변수/IAM 권한을 요구하는 코드를 추가할 때 지킬 규칙**: CI가 코드를 자동으로, 즉시
배포하는 반면 그 코드가 필요로 하는 인프라(환경변수/IAM)는 `terraform apply`가 될 때까지는
아직 없을 수 있다. 그래서 새 환경변수는 optional로 읽고(없으면 그 기능만 건너뜀), 새 권한이
필요한 AWS SDK 호출은 실패해도 fail-open으로 넘어가도록 짜야 한다(`GAME_METRIC_NAMESPACE`/
`GetMetricData`가 이미 이 패턴을 따른다, 위 "QuizSnapshotFailure 복구 확인" 참고) - 그렇지 않으면
CI가 새 코드를 먼저 배포한 순간부터 `terraform apply` 전까지 이 Lambda의 기존 기능까지 전부
깨질 수 있다.

## 테스트

```bash
yarn workspace alarm-notifier test
```

`test/fixtures/alarm-state-change.json`은 실제 EventBridge "CloudWatch Alarm State Change"
payload 형태를 흉내 낸 fixture다(계정 ID 등은 AWS 문서에서 흔히 쓰는 예시값 `123456789012`이고
실제 값이 아니다).

## Slack Incoming Webhook 등록

이 저장소/Terraform 코드는 Webhook URL 값을 직접 다루지 않는다. 아래 절차는 사용자가 직접 실행한다.

1. Slack에서 Incoming Webhook을 생성해 URL을 받는다.
2. AWS SSM Parameter Store에 `SecureString`으로 등록한다(파라미터 이름은
   `infra/terraform/modules/notification/variables.tf`의 `slack_webhook_parameter_name`
   기본값과 반드시 같아야 한다):

   ```bash
   aws ssm put-parameter \
     --name "/song-quiz/prod/slack/alarm-webhook-url" \
     --type "SecureString" \
     --value "<SLACK_WEBHOOK_URL>"
   ```

3. `terraform apply`로 EventBridge Rule/Lambda/IAM을 배포한다(Lambda에는 이 파라미터 하나만
   조회할 수 있는 `ssm:GetParameter` 권한만 부여된다).

## 배포 후 수동 테스트

CPU를 실제로 95%까지 올리지 않아도 `aws cloudwatch set-alarm-state`로 파이프라인 전체를
검증할 수 있다. 아직 아무 사고도 아닌 Alarm(예: `QuizSnapshotFailure`)을 골라 상태를
강제로 바꿔본다.

```bash
# 장애 알림(🚨) 확인
aws cloudwatch set-alarm-state \
  --alarm-name "SongQuiz-Prod-High-Game-QuizSnapshotFailure" \
  --state-value ALARM \
  --state-reason "notification pipeline test"

# 잠시 후 복구 알림(✅ [복구됨]) 확인
aws cloudwatch set-alarm-state \
  --alarm-name "SongQuiz-Prod-High-Game-QuizSnapshotFailure" \
  --state-value OK \
  --state-reason "notification recovery test"
```

`set-alarm-state`로 강제 변경한 상태도 일반적인 Alarm 상태 변화와 동일하게 EventBridge
"CloudWatch Alarm State Change" 이벤트를 발생시킨다(AWS가 상태 변화의 원인을 구분하지 않고
동일한 이벤트를 내보낸다). 테스트가 끝나면 위처럼 반드시 `OK`로 되돌려 실제 Alarm 상태를
정상화한다.

Lambda 자체 동작만 빠르게 보고 싶다면 CloudWatch Console > Lambda > `song-quiz-prod-alarm-notifier`
> Monitor > Logs에서 `alarm_notification_sent`/`alarm_notification_failed` 구조화 로그를 확인한다.
