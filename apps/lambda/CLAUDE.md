# Lambda functions (apps/lambda)

# Purpose

CloudWatch Alarm 상태 변화에 반응하는 운영 자동화 Lambda 2개를 소유한다. 둘 다 `yarn` workspace(`apps/lambda/*`)이며, 각자 독립된 EventBridge Rule/Terraform 모듈에 연결된다 — 하나가 실패/지연되어도 다른 하나에는 영향이 없다.

- `alarm-notifier`([`README`](alarm-notifier/README.md)): `SongQuiz-Prod-*` 전체 Alarm의 상태 변화(`ALARM`/`OK`)를 그대로 Slack Incoming Webhook으로 전달한다. Terraform: [`infra/terraform/modules/notification/`](../../infra/terraform/modules/notification).
- `incident-analyzer`([`README`](incident-analyzer/README.md)): `QuizSnapshotFailure`/`Game Target5xx` 두 Alarm만 대상으로, CloudWatch Metrics/Logs Insights/X-Ray Trace를 모아 OpenAI로 장애 원인 후보를 분석해 Slack으로 전달한다. Terraform: [`infra/terraform/modules/aiops/`](../../infra/terraform/modules/aiops).
- 둘 다 NestJS 없이 plain Lambda handler(`src/handler.ts`)만 쓴다. `@aws-sdk/*`는 Lambda Node.js 관리형 런타임이 이미 제공하므로 devDependencies로만 선언한다(번들에 포함하지 않음).
- 빌드 산출물(`dist/`)을 Terraform의 `data "archive_file"`이 그대로 zip으로 묶으므로, **`terraform plan`/`apply` 전에 반드시 먼저 빌드해야 한다.** 단, 코드(`src/**`)만 바뀐 경우엔 아래 "코드 배포" 항목대로 CI가 자동으로 배포하므로 그때는 로컬 apply가 필요 없다 — apply는 환경변수/IAM/새 리소스 등 인프라 자체가 바뀔 때만 필요하다.

# 코드 배포 (CI 자동)

`deploy-api.yml`/`deploy-game.yml`(EC2에 SSH로 git pull + PM2 reload)과 같은 패턴을 Lambda에도 적용한다 — `.github/workflows/deploy-alarm-notifier.yml`/`deploy-incident-analyzer.yml`이 `apps/lambda/<name>/**` 변경을 감지해 `main` merge 시 `aws lambda update-function-code`로 코드만 바로 배포한다. Terraform은 그 외 모든 것(환경변수, IAM, timeout 등)을 계속 관리하며, 두 `aws_lambda_function` 리소스의 `lifecycle.ignore_changes = [filename, source_code_hash]`가 CI 배포와 `terraform apply`가 서로 코드를 되돌리지 않도록 막는다.

**이 분리 구조가 안전하려면 지킬 규칙 하나가 있다**: 코드 배포(CI, 자동/즉시)와 인프라 배포(`terraform apply`, 로컬/수동)의 타이밍이 서로 어긋날 수 있다는 전제를 깔고 코드를 짜야 한다. 즉, 새 환경변수나 새 IAM 권한을 요구하는 코드를 추가할 때는:

- 환경변수가 아직 없을 수 있다고 가정하고 optional로 읽는다(`process.env.X` 없으면 그 기능만 건너뛰거나 안전한 기본값으로 폴백 — 필수로 만들어 없으면 throw하지 않는다).
- 새 IAM 권한을 쓰는 AWS SDK 호출은 실패(AccessDenied)해도 Lambda 전체가 죽지 않도록 try/catch로 감싸고, 실패 시 이전 동작으로 fallback한다(예: `alarm-notifier`의 `GetMetricData` 실패 시 fail-open).

이렇게 하지 않으면, CI가 새 코드를 먼저 배포했는데 아직 `terraform apply`가 안 된 상태에서 그 Lambda의 기존 기능까지 전부 깨질 수 있다.

# Dependencies

- `apps/api`/`apps/game`을 직접 참조하지 않는다 — CloudWatch/EventBridge/SSM을 거쳐서만 상호작용한다.
- `incident-analyzer`는 `.github/workflows/deploy-api.yml`/`deploy-game.yml`이 SSM에 기록하는 배포 metadata를 보조 근거로 읽는다.
- 상세 아키텍처, 환경 변수, 배포 후 수동 검증 절차는 각 워크스페이스의 README를 따른다 — 이 파일에서 중복하지 않는다.

# Commands

```bash
yarn workspace alarm-notifier build   # tsc
yarn workspace alarm-notifier test

yarn workspace incident-analyzer build   # tsc --noEmit + esbuild 번들(openai 포함)
yarn workspace incident-analyzer test
```

# Verification

1. 각 워크스페이스의 `build`/`test`를 실행한다.
2. Terraform 변경이 함께 있다면 해당 모듈(`modules/notification`, `modules/aiops`) `plan` 결과를 확인한다.
3. 배포 후 실제 파이프라인 검증은 각 README의 "배포 후 검증 절차"를 따른다(가짜 Alarm으로 `aws cloudwatch set-alarm-state` 사용).
