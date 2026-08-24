# incident-analyzer

`SongQuiz-Prod-High-Game-QuizSnapshotFailure` Alarm의 `ALARM` 상태 변화를 EventBridge로 받아
최근 15분의 CloudWatch Metrics/Logs Insights/X-Ray Trace를 모아 `IncidentContext`로 정규화하고,
OpenAI로 장애 원인 후보를 분석해 Slack으로 전달하는 Lambda다. Terraform 정의는
[`infra/terraform/modules/aiops/`](../../../infra/terraform/modules/aiops)에 있다.

```text
CloudWatch Alarm(QuizSnapshotFailure, ALARM)
  -> EventBridge Rule(aiops 전용)
  -> 이 Lambda
     -> CloudWatch Metrics(GetMetricData)
     -> CloudWatch Logs Insights(StartQuery/GetQueryResults)
     -> X-Ray(BatchGetTraces, 로그의 traceId 기반)
     -> IncidentContext
     -> OpenAI(Responses API, Structured Output)
  -> Slack Incoming Webhook(alarm-notifier와 동일 Webhook 재사용)
```

기존 `alarm-notifier`(즉시 알림)와는 완전히 분리된 EventBridge Rule/target이다 - 이 Lambda가
실패하거나 느려도 `alarm-notifier`의 즉시 알림에는 영향을 주지 않는다.

NestJS/Express 없이 plain Lambda handler(`src/handler.ts`)만 사용한다. `openai`는 Lambda
런타임이 제공하지 않는 npm 패키지라 `dependencies`로 선언하고, `@aws-sdk/*`는 alarm-notifier와
동일하게 Lambda Node.js 관리형 런타임이 이미 포함하고 있어 `devDependencies`로만 선언한다
(타입체크/테스트 목적).

## 빌드

```bash
yarn workspace incident-analyzer build
```

alarm-notifier와 달리 `tsc`만으로는 배포 zip이 동작하지 않는다(`openai`가 번들에 없으면 Lambda가
`Cannot find module 'openai'`로 즉시 실패). `build` 스크립트는 먼저 `tsc --noEmit`으로 타입을
검증하고, `esbuild`(`esbuild.config.js`)로 `src/handler.ts`와 `openai`를 `dist/handler.js`
하나로 번들링한다. `@aws-sdk/*`는 런타임이 제공하므로 `external`로 제외해 번들 크기를 줄인다.
Terraform의 `data "archive_file"`이 이 `dist/`를 그대로 zip으로 묶으므로, **`terraform
plan`/`apply` 전에 반드시 먼저 빌드해야 한다.**

## 테스트

```bash
yarn workspace incident-analyzer test
```

AWS SDK(`@aws-sdk/client-cloudwatch`, `-cloudwatch-logs`, `-xray`, `-ssm`)와 `openai`, Slack
전송은 전부 mock한다 - 실제 AWS/OpenAI/Slack 호출 없이 실행된다.

## 환경 변수

| 이름 | 필수 | 기본값 | 설명 |
|---|---|---|---|
| `TARGET_ALARM_NAME` | 아니오 | `SongQuiz-Prod-High-Game-QuizSnapshotFailure` | 분석 대상 Alarm 이름(방어적 재검증용) |
| `GAME_LOG_GROUP_NAME` | 예 | - | Logs Insights를 조회할 apps/game Log Group(`modules/logging` 출력) |
| `GAME_METRIC_NAMESPACE` | 아니오 | `SongQuiz/Game` | QuizSnapshotFailure Custom Metric namespace |
| `ALB_ARN_SUFFIX` | 예 | - | ALB arn_suffix(`modules/load_balancer` 출력) |
| `API_TARGET_GROUP_ARN_SUFFIX` | 예 | - | apps/api 타겟그룹 arn_suffix |
| `GAME_TARGET_GROUP_ARN_SUFFIX` | 예 | - | apps/game 타겟그룹 arn_suffix |
| `DB_INSTANCE_IDENTIFIER` | 예 | - | RDS 인스턴스 식별자(`modules/database` 출력) |
| `SLACK_WEBHOOK_PARAMETER_NAME` | 예 | - | alarm-notifier와 동일한 Slack Webhook SSM Parameter 이름 |
| `OPENAI_API_KEY_PARAMETER_NAME` | 예 | - | OpenAI API Key SSM SecureString Parameter 이름 |
| `OPENAI_MODEL` | 아니오 | `gpt-5.6-luna` | OpenAI 모델 이름(비용을 고려해 apps/api의 `gpt-5.6-luna`보다 가벼운 모델을 기본값으로 둔다 - 실제 계정에서 사용 가능한 모델 이름으로 조정 필요) |

필수 환경 변수가 하나라도 비어 있으면 AWS API를 호출하기 전에 `incident_analysis_failed`
(`stage: "config"`)를 로그로 남기고 조용히 종료한다.

## OpenAI API Key / Slack Webhook 등록

이 Lambda는 두 개의 SSM SecureString Parameter를 읽는다. Slack Webhook은 alarm-notifier가
이미 등록해둔 것을 그대로 재사용하고(별도 Webhook을 새로 만들지 않는다), OpenAI API Key만
새로 등록한다.

```bash
aws ssm put-parameter \
  --name "/song-quiz/prod/openai/api-key" \
  --type "SecureString" \
  --value "<OPENAI_API_KEY>"
```

## 배포 후 검증 절차

### 1) Pipeline test (가짜 Alarm)

`set-alarm-state`로 강제 발생시킨 Alarm에는 실제 `quiz_snapshot_failed` 로그/Trace가 없을
수 있다. 이 경우에도 AI가 "데이터 부족, confidence=LOW"로 정상적으로 응답하면 pipeline
자체는 성공으로 본다.

```bash
aws cloudwatch set-alarm-state \
  --alarm-name "SongQuiz-Prod-High-Game-QuizSnapshotFailure" \
  --state-value ALARM \
  --state-reason "aiops incident analysis test"

# 확인 후 반드시 OK로 되돌린다 (alarm-notifier가 별도로 복구 알림도 보낸다)
aws cloudwatch set-alarm-state \
  --alarm-name "SongQuiz-Prod-High-Game-QuizSnapshotFailure" \
  --state-value OK \
  --state-reason "aiops incident analysis test recovery"
```

CloudWatch Console > Lambda > `song-quiz-prod-incident-analyzer` > Monitor > Logs에서
`incident_analysis_started` -> `incident_context_collected` -> `incident_analysis_completed`
(또는 실패 시 `incident_analysis_failed` + `stage`)를 확인한다.

### 2) 실제 QuizSnapshotFailure 기반 end-to-end 테스트

실제로 게임 시작 중 apps/api 응답 지연/장애를 재현해 `quiz_snapshot_failed` 로그가 실제로
쌓이게 한 뒤 Alarm이 자연 발생하는 것을 기다린다. 이 경우에만 Metrics/Logs/Trace가 모두
실데이터로 채워진 분석 품질을 확인할 수 있다. traceId -> X-Ray 변환(`otelTraceIdToXrayTraceId`,
`src/context/collect-traces.ts`)이 실제 CloudWatch Agent의 OTLP->X-Ray 변환과 맞는지는
이 실제 테스트에서만 확인 가능하다(가짜 Alarm 테스트로는 검증되지 않는다).
