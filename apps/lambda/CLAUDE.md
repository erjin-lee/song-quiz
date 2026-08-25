# Lambda functions (apps/lambda)

# Purpose

CloudWatch Alarm 상태 변화에 반응하는 운영 자동화 Lambda 2개를 소유한다. 둘 다 `yarn` workspace(`apps/lambda/*`)이며, 각자 독립된 EventBridge Rule/Terraform 모듈에 연결된다 — 하나가 실패/지연되어도 다른 하나에는 영향이 없다.

- `alarm-notifier`([`README`](alarm-notifier/README.md)): `SongQuiz-Prod-*` 전체 Alarm의 상태 변화(`ALARM`/`OK`)를 그대로 Slack Incoming Webhook으로 전달한다. Terraform: [`infra/terraform/modules/notification/`](../../infra/terraform/modules/notification).
- `incident-analyzer`([`README`](incident-analyzer/README.md)): `QuizSnapshotFailure`/`Game Target5xx` 두 Alarm만 대상으로, CloudWatch Metrics/Logs Insights/X-Ray Trace를 모아 OpenAI로 장애 원인 후보를 분석해 Slack으로 전달한다. Terraform: [`infra/terraform/modules/aiops/`](../../infra/terraform/modules/aiops).
- 둘 다 NestJS 없이 plain Lambda handler(`src/handler.ts`)만 쓴다. `@aws-sdk/*`는 Lambda Node.js 관리형 런타임이 이미 제공하므로 devDependencies로만 선언한다(번들에 포함하지 않음).
- 빌드 산출물(`dist/`)을 Terraform의 `data "archive_file"`이 그대로 zip으로 묶으므로, **`terraform plan`/`apply` 전에 반드시 먼저 빌드해야 한다.**

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
