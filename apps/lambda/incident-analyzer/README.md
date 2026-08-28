# incident-analyzer

`SongQuiz-Prod-High-Game-QuizSnapshotFailure`/`SongQuiz-Prod-High-Game-Target5xx`/
`SongQuiz-Prod-High-API-Target5xx` 세 Alarm의 `ALARM` 상태 변화를 EventBridge로 받아 최근
15분의 CloudWatch Metrics/Logs Insights/X-Ray Trace를 모아 `IncidentContext`로 정규화하고,
OpenAI로 장애 원인 후보를 분석해 Slack으로 전달하는 Lambda다. Terraform 정의는
[`infra/terraform/modules/aiops/`](../../../infra/terraform/modules/aiops)에 있다.

```text
CloudWatch Alarm(QuizSnapshotFailure | Game Target5xx | API Target5xx, ALARM)
  -> EventBridge Rule(aiops 전용)
  -> 이 Lambda
     -> CloudWatch DescribeAlarms(실제 Alarm 평가 조건)
     -> CloudWatch Metrics(GetMetricData, missing/collection-failed 의미 구분)
     -> CloudWatch Logs Insights(StartQuery/GetQueryResults - IncidentType별 game/api Log Group)
     -> X-Ray(BatchGetTraces, 로그의 traceId 기반)
     -> SSM(API/Game Production Deployment Metadata - 보조 근거)
     -> IncidentContext
     -> OpenAI(Responses API, Structured Output)
  -> Slack Incoming Webhook(alarm-notifier와 동일 Webhook 재사용)
```

기존 `alarm-notifier`(즉시 알림)와는 완전히 분리된 EventBridge Rule/target이다 - 이 Lambda가
실패하거나 느려도 `alarm-notifier`의 즉시 알림에는 영향을 주지 않는다.

## 지원하는 Alarm(IncidentType)

Alarm 이름 -> `IncidentType`(`src/context/types.ts`) 매핑은 `src/context/incident-policy.ts`의
`INCIDENT_POLICIES`(각 IncidentType의 `alarmNameEnvVar`/`defaultAlarmName`)를 source of
truth로, `src/handler.ts`의 `INCIDENT_TYPE_BY_ALARM_NAME`이 조회해서 만든다. 이 맵에 없는
Alarm(UnhealthyHost, EC2 CPU/Memory/Disk 등)은 EventBridge Rule에도 Lambda 방어 로직에도
걸리지 않아 자동으로 분석 대상에서 제외된다.

| Alarm | IncidentType | 비고 |
|---|---|---|
| `SongQuiz-Prod-High-Game-QuizSnapshotFailure` | `QUIZ_SNAPSHOT_FAILURE` | 최초 구현(v1) - Metric 10개(아래 참고) |
| `SongQuiz-Prod-High-Game-Target5xx` | `GAME_TARGET_5XX` | v1-2 추가 - Metric 19개(아래 참고) |
| `SongQuiz-Prod-High-API-Target5xx` | `API_TARGET_5XX` | v1-3 추가 - Metric 16개, Log Group만 apps/api로 전환(아래 참고) |

`IncidentType`별로 실제 조회하는 Metric 목록(과 log source/필수 env/trace 수집 여부/
deployment 대상 서비스)은 `src/context/incident-policy.ts`의 `INCIDENT_POLICIES`
(`IncidentPolicy`)에서 한 곳에 모아 관리한다(범용 Policy Engine/YAML/Plugin framework
없이, 이 정도 크기에서는 TypeScript 타입 + 작은 상수 맵으로 충분하다고 판단했다) -
`collect-metrics.ts`/`collect-logs.ts`/`collect-deployments.ts`/`handler.ts`는 이 맵을
조회하기만 하고 IncidentType별 분기를 따로 두지 않는다. 새 IncidentType을 추가할 때는
`INCIDENT_POLICIES`에 항목 하나를 추가하고(필요하면 `collect-metrics.ts`의
`buildAllQuerySpecs`에 새 metric spec을 더하고), `src/context/types.ts`의 `IncidentType`
union에 값을 추가하면 된다. Structured Output schema/Slack 메시지 포맷
(`src/openai/schema.ts`, `src/slack/build-ai-analysis-message.ts`)은 모든 IncidentType이
공유한다.

`QUIZ_SNAPSHOT_FAILURE`가 조회하는 10개 Metric(최초 구현(v1) 7개 + room 분산 락 Redis 장애
내성 이벤트 3종). 게임 시작이 room lock 아래에서 수행되므로, 동일 분석 시간대에 lock
이상이 함께 발생했는지를 보조 근거로 관찰한다(lock metric에는 roomId dimension이 없어
"같은 게임 시작 흐름"까지는 특정할 수 없다). 단, lock 이상 자체가 quiz_snapshot_failed의
직접 원인이라는 의미는 아니다.

| Metric | Namespace | Dimension |
|---|---|---|
| Game.QuizSnapshotFailure | `GAME_METRIC_NAMESPACE`(기본 SongQuiz/Game) | 없음 |
| Game.RedisLockRenewFailure | `GAME_METRIC_NAMESPACE` | 없음 |
| Game.RoomLockLeaseLost | `GAME_METRIC_NAMESPACE` | 없음 |
| Game.StaleFencingWriteRejected | `GAME_METRIC_NAMESPACE` | 없음 |
| API.HTTPCode_Target_5XX_Count | AWS/ApplicationELB | LoadBalancer, TargetGroup(api) |
| API.TargetResponseTime | AWS/ApplicationELB | LoadBalancer, TargetGroup(api) |
| Game.HTTPCode_Target_5XX_Count | AWS/ApplicationELB | LoadBalancer, TargetGroup(game) |
| Game.TargetResponseTime | AWS/ApplicationELB | LoadBalancer, TargetGroup(game) |
| RDS.CPUUtilization | AWS/RDS | DBInstanceIdentifier |
| RDS.DatabaseConnections | AWS/RDS | DBInstanceIdentifier |

`GAME_TARGET_5XX`가 조회하는 19개 Metric(모두 `infra/terraform/modules/monitoring/dashboard.tf`가
이미 쓰는 것과 동일한 namespace/dimension을 재사용한다 - 새 Custom Metric은 만들지 않는다):

| Metric | Namespace | Dimension |
|---|---|---|
| Game.HTTPCode_Target_5XX_Count | AWS/ApplicationELB | LoadBalancer, TargetGroup(game) |
| Game.TargetResponseTime | AWS/ApplicationELB | LoadBalancer, TargetGroup(game) |
| Game.RequestCount | AWS/ApplicationELB | LoadBalancer, TargetGroup(game) |
| API.HTTPCode_Target_5XX_Count | AWS/ApplicationELB | LoadBalancer, TargetGroup(api) |
| API.TargetResponseTime | AWS/ApplicationELB | LoadBalancer, TargetGroup(api) |
| API.RequestCount | AWS/ApplicationELB | LoadBalancer, TargetGroup(api) |
| Game.QuizSnapshotFailure | `GAME_METRIC_NAMESPACE`(기본 SongQuiz/Game) | 없음 |
| Game.RedisLockFailure | `GAME_METRIC_NAMESPACE` | 없음 |
| Game.TimerClaimFailure | `GAME_METRIC_NAMESPACE` | 없음 |
| Game.RedisLockRenewFailure | `GAME_METRIC_NAMESPACE` | 없음 |
| Game.RoomLockLeaseLost | `GAME_METRIC_NAMESPACE` | 없음 |
| Game.StaleFencingWriteRejected | `GAME_METRIC_NAMESPACE` | 없음 |
| EC2.CPUUtilization | AWS/EC2 | InstanceId |
| EC2.MemoryUsedPercent | `EC2_METRIC_NAMESPACE`(CloudWatch Agent) | InstanceId |
| Redis.MemoryUsagePercentage | AWS/ElastiCache | CacheClusterId |
| Redis.CurrConnections | AWS/ElastiCache | CacheClusterId |
| Redis.Evictions | AWS/ElastiCache | CacheClusterId |
| RDS.CPUUtilization | AWS/RDS | DBInstanceIdentifier |
| RDS.DatabaseConnections | AWS/RDS | DBInstanceIdentifier |

Logs/Trace/Deployment 수집 로직(`collect-logs.ts`/`collect-traces.ts`/`collect-deployments.ts`)은
`QUIZ_SNAPSHOT_FAILURE`와 동일하게 재사용한다 - Game 최근 15분 error 로그(`level = "error"`
기준, quiz_snapshot_failed 이벤트만 대상이 아니다) -> 로그의 traceId로 X-Ray 조회 ->
API/Game Production Deployment 순으로 그대로 동작한다.

`API_TARGET_5XX`(v1-3)는 `INCIDENT_POLICIES.API_TARGET_5XX.metricNames`에서 아래 16개 metric만 고른다(새 metric
spec 없이 `GAME_TARGET_5XX`가 이미 쓰는 spec을 그대로 재사용 - room 분산 락 3종 포함):

| Metric | Namespace | Dimension |
|---|---|---|
| API.HTTPCode_Target_5XX_Count | AWS/ApplicationELB | LoadBalancer, TargetGroup(api) |
| API.TargetResponseTime | AWS/ApplicationELB | LoadBalancer, TargetGroup(api) |
| API.RequestCount | AWS/ApplicationELB | LoadBalancer, TargetGroup(api) |
| Game.HTTPCode_Target_5XX_Count | AWS/ApplicationELB | LoadBalancer, TargetGroup(game) |
| Game.TargetResponseTime | AWS/ApplicationELB | LoadBalancer, TargetGroup(game) |
| Game.RequestCount | AWS/ApplicationELB | LoadBalancer, TargetGroup(game) |
| Game.RedisLockRenewFailure | `GAME_METRIC_NAMESPACE` | 없음 |
| Game.RoomLockLeaseLost | `GAME_METRIC_NAMESPACE` | 없음 |
| Game.StaleFencingWriteRejected | `GAME_METRIC_NAMESPACE` | 없음 |
| RDS.CPUUtilization | AWS/RDS | DBInstanceIdentifier |
| RDS.DatabaseConnections | AWS/RDS | DBInstanceIdentifier |
| EC2.CPUUtilization | AWS/EC2 | InstanceId |
| EC2.MemoryUsedPercent | `EC2_METRIC_NAMESPACE`(CloudWatch Agent) | InstanceId |
| Redis.MemoryUsagePercentage | AWS/ElastiCache | CacheClusterId |
| Redis.CurrConnections | AWS/ElastiCache | CacheClusterId |
| Redis.Evictions | AWS/ElastiCache | CacheClusterId |

`API_TARGET_5XX`는 Logs만 다른 소스를 본다 - `incident-policy.ts`의
`IncidentPolicy.logSource`(`INCIDENT_POLICIES`)가 IncidentType마다 game/api Log Group을
정하고, `collect-logs.ts`는 그 값에 맞는 쿼리를 고른다.
apps/api Log Group(`API_LOG_GROUP_NAME`)에는 구조화 app 예외 로그(event/errorCode)와
access 로그(method/path/statusCode, `AccessLogMiddleware`)가 같은 PM2 stdout으로 섞여
쌓인다(`ecosystem.config.js`가 둘 다 `logs/api.log` 하나로 합침) - 두 로그 모두 5xx/예외
상황에서 `level="error"`를 남기므로 `filter level = "error"` 하나로 함께 조회한다. 이 로그
그룹에는 Nest 라우트 패턴이 아니라 요청의 실제 `path`(id 등 가변 세그먼트 포함)만 존재해서,
route 패턴별 집계(`routeCounts`)는 구현하지 않았다 - 대신 `LogSample.path`/`method`/
`statusCode`를 그대로 노출해 AI가 개별 샘플 단위로만 참고하게 한다(억지 문자열 파싱으로
route를 정규화하지 않는다, `apps/lambda/incident-analyzer/src/context/collect-logs.ts` 참고).

game과 달리 로그 레코드 원문(`@message`)은 조회하지 않고 `message`(JSON 최상위 필드)만
선택한다 - `AccessLogMiddleware`가 같은 JSON 레코드에 `ip`/`userId`/`claimedUserId`/`query`/
`body`/`userAgent`까지 함께 남기므로, `@message`를 그대로 가져오면 `LogSample` allowlist를
우회해 그 개인정보/요청 본문이 원본 그대로 OpenAI로 전달된다. `message` 필드는 access 로그는
`${method} ${path}`, app 예외 로그는 `exception.message`만 담고 있어 다른 필드가 섞여 들어올
수 없다. 대표 샘플 dedupe key에도 `method`를 포함해, 같은 path/statusCode라도 서로 다른
HTTP method(예: 같은 리소스의 GET과 DELETE)가 한 건으로 뭉개지지 않게 한다.

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
plan`/`apply` 전에 반드시 먼저 빌드해야 한다.** 단, 코드(`src/**`)만 바뀐 경우엔 아래
"코드 배포(CI 자동)"대로 CI가 자동으로 배포하므로 로컬 apply가 필요 없다.

## 코드 배포(CI 자동)

`apps/lambda/incident-analyzer/**`가 바뀐 채로 `main`에 merge되면
[`deploy-incident-analyzer.yml`](../../../.github/workflows/deploy-incident-analyzer.yml)이 빌드
후 `aws lambda update-function-code`로 코드만 바로 배포한다. 환경변수/IAM/timeout 등 인프라
자체를 바꿀 때만 여전히 `terraform apply`(로컬, 수동)가 필요하다(`aws_lambda_function.
incident_analyzer`의 `lifecycle.ignore_changes`가 이 둘이 서로의 배포를 되돌리지 않도록 막는다).
IAM Role 등록 절차는 아래 "Deploy workflow가 SSM에 쓸 수 있으려면"과 동일한 맥락으로,
`CI_DEPLOY_LAMBDA_ROLE_ARN`을 한 번 더 등록해야 한다(alarm-notifier와 이 Lambda가 같은 role을
공유한다 - `infra/terraform/environments/bootstrap/deploy-lambda.tf` 참고).

새 환경변수/IAM 권한을 요구하는 코드를 추가할 때는 `apps/lambda/CLAUDE.md`의 "코드 배포(CI
자동)" 규칙을 따른다 - CI가 코드를 먼저 배포해도 `terraform apply` 전까지 이 Lambda의 기존
기능이 깨지지 않도록, 새 환경변수는 optional로 읽고 새 권한이 필요한 호출은 실패해도 fail-open
으로 넘어가게 짠다.

## 테스트

```bash
yarn workspace incident-analyzer test
```

AWS SDK(`@aws-sdk/client-cloudwatch`, `-cloudwatch-logs`, `-xray`, `-ssm`)와 `openai`, Slack
전송은 전부 mock한다 - 실제 AWS/OpenAI/Slack 호출 없이 실행된다.

## 환경 변수

| 이름 | 필수 | 기본값 | 설명 |
|---|---|---|---|
| `QUIZ_SNAPSHOT_FAILURE_ALARM_NAME` | 아니오 | `SongQuiz-Prod-High-Game-QuizSnapshotFailure` | `QUIZ_SNAPSHOT_FAILURE` 분석 대상 Alarm 이름(방어적 재검증용) |
| `GAME_TARGET_5XX_ALARM_NAME` | 아니오 | `SongQuiz-Prod-High-Game-Target5xx` | `GAME_TARGET_5XX` 분석 대상 Alarm 이름(방어적 재검증용) |
| `API_TARGET_5XX_ALARM_NAME` | 아니오 | `SongQuiz-Prod-High-API-Target5xx` | `API_TARGET_5XX` 분석 대상 Alarm 이름(방어적 재검증용) |
| `GAME_LOG_GROUP_NAME` | 예 | - | Logs Insights를 조회할 apps/game Log Group(`modules/logging` 출력) |
| `API_LOG_GROUP_NAME` | `API_TARGET_5XX`일 때만 | - | Logs Insights를 조회할 apps/api Log Group(`modules/logging` 출력) - 없으면 `API_TARGET_5XX`만 config 실패로 skip되고, 다른 두 IncidentType은 영향받지 않는다(`findMissingEnv`가 IncidentType별로 판단) |
| `GAME_METRIC_NAMESPACE` | 아니오 | `SongQuiz/Game` | QuizSnapshotFailure/RedisLockFailure/TimerClaimFailure Custom Metric namespace |
| `ALB_ARN_SUFFIX` | 예 | - | ALB arn_suffix(`modules/load_balancer` 출력) |
| `API_TARGET_GROUP_ARN_SUFFIX` | 예 | - | apps/api 타겟그룹 arn_suffix |
| `GAME_TARGET_GROUP_ARN_SUFFIX` | 예 | - | apps/game 타겟그룹 arn_suffix |
| `DB_INSTANCE_IDENTIFIER` | 예 | - | RDS 인스턴스 식별자(`modules/database` 출력) |
| `EC2_INSTANCE_ID` | 예 | - | app_a EC2 인스턴스 ID(`modules/compute` 출력) - `GAME_TARGET_5XX`의 EC2 CPU/Memory 조회용 |
| `EC2_METRIC_NAMESPACE` | 예 | - | CloudWatch Agent EC2 Memory 지표 namespace(`modules/iam` 출력) |
| `CACHE_CLUSTER_ID` | 예 | - | ElastiCache 클러스터 ID(`modules/cache` 출력) - `GAME_TARGET_5XX`의 Redis Memory/Connections/Evictions 조회용 |
| `SLACK_WEBHOOK_PARAMETER_NAME` | 예 | - | alarm-notifier와 동일한 Slack Webhook SSM Parameter 이름 |
| `OPENAI_API_KEY_PARAMETER_NAME` | 예 | - | OpenAI API Key SSM SecureString Parameter 이름 |
| `OPENAI_MODEL` | 아니오 | `gpt-5.6-luna` | OpenAI 모델 이름(비용을 고려해 apps/api의 `gpt-5.6-luna`보다 가벼운 모델을 기본값으로 둔다 - 실제 계정에서 사용 가능한 모델 이름으로 조정 필요) |
| `API_DEPLOYMENT_PARAMETER_NAME` | 아니오 | `/song-quiz/prod/deployment/api` | apps/api Production 배포 metadata SSM Parameter(String) - deploy-api.yml이 기록 |
| `GAME_DEPLOYMENT_PARAMETER_NAME` | 아니오 | `/song-quiz/prod/deployment/game` | apps/game Production 배포 metadata SSM Parameter(String) - deploy-game.yml이 기록 |

`EC2_INSTANCE_ID`/`EC2_METRIC_NAMESPACE`/`CACHE_CLUSTER_ID`는 `QUIZ_SNAPSHOT_FAILURE`
분석에서는 쓰지 않지만, 두 IncidentType이 같은 Lambda/환경변수 집합을 공유하므로 필수
환경변수로 취급한다(`findMissingEnv`).

필수 환경 변수(`API_DEPLOYMENT_PARAMETER_NAME`/`GAME_DEPLOYMENT_PARAMETER_NAME` 제외)가
하나라도 비어 있으면 AWS API를 호출하기 전에 `incident_analysis_failed`(`stage: "config"`)를
로그로 남기고 조용히 종료한다. Deployment Context는 보조 근거라 설정이 없어도(또는 아직
SSM에 값이 기록되지 않았어도) 나머지 분석은 그대로 진행한다.

## Deployment Metadata(§11~19)

`.github/workflows/deploy-api.yml`/`deploy-game.yml`이 Production 배포(SSH + PM2 reload)
성공 직후 `.github/scripts/write-deployment-metadata.sh`로 실제 배포된 commit과 그
commit에 연결된 PR(GitHub "List pull requests associated with a commit" API)을 조회해
SSM Parameter(String, secret 아님)에 기록한다. 이 Lambda는 그 값을 읽기만 하고, GitHub
API를 직접 호출하지 않는다.

```json
{
  "service": "api",
  "commitSha": "abc123...",
  "deployedAt": "2026-08-24T03:10:00Z",
  "repository": "erjin-lee/song-quiz",
  "workflowRunId": "123456789",
  "pullRequest": {
    "number": 82,
    "title": "Quiz Snapshot 조회 로직 개선",
    "summary": "...",
    "changedFiles": ["apps/api/src/quiz/quiz.service.ts"]
  }
}
```

direct push(연결된 PR 없음)면 `pullRequest`는 `null`이다. 최근 배포/PR은 System
Prompt(`src/openai/prompt.ts`)에서 명시적으로 "보조 근거"로만 쓰도록 지시한다 - 최근에
배포되었다는 사실만으로 원인으로 단정하지 않는다.

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

## Deploy workflow가 SSM에 쓸 수 있으려면

`infra/terraform/environments/bootstrap`(로컬에서 직접 apply하는 root, CI 대상 아님)에
`aws_iam_role.ci_deploy_metadata`가 정의되어 있다. `terraform apply` 후 출력되는
`ci_deploy_metadata_role_arn` 값을 GitHub 저장소 Variable `CI_DEPLOY_METADATA_ROLE_ARN`에
등록해야 `deploy-api.yml`/`deploy-game.yml`의 `Record deployment metadata` 스텝이 동작한다
(`TF_CI_ROLE_ARN`을 이미 등록한 것과 동일한 절차). 이 role은 SSM에 배포 metadata를 쓰는
용도로만 좁혀져 있고, 위 "코드 배포(CI 자동)"의 `CI_DEPLOY_LAMBDA_ROLE_ARN`(Lambda 코드
업데이트 전용)과는 별개의 role이다 - 서로 대체할 수 없다.

## 배포 후 검증 절차

### 1) Pipeline test (가짜 Alarm)

`set-alarm-state`로 강제 발생시킨 Alarm에는 실제 장애 로그/Trace가 없을 수 있다. 이
경우에도 AI가 "데이터 부족, confidence=LOW"로 정상적으로 응답하면 pipeline 자체는
성공으로 본다. 세 Alarm 모두 같은 방식으로 테스트한다.

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

# Game Target5xx도 동일하게
aws cloudwatch set-alarm-state \
  --alarm-name "SongQuiz-Prod-High-Game-Target5xx" \
  --state-value ALARM \
  --state-reason "aiops incident analysis test"

aws cloudwatch set-alarm-state \
  --alarm-name "SongQuiz-Prod-High-Game-Target5xx" \
  --state-value OK \
  --state-reason "aiops incident analysis test recovery"

# API Target5xx도 동일하게
aws cloudwatch set-alarm-state \
  --alarm-name "SongQuiz-Prod-High-API-Target5xx" \
  --state-value ALARM \
  --state-reason "aiops incident analysis test"

aws cloudwatch set-alarm-state \
  --alarm-name "SongQuiz-Prod-High-API-Target5xx" \
  --state-value OK \
  --state-reason "aiops incident analysis test recovery"
```

CloudWatch Console > Lambda > `song-quiz-prod-incident-analyzer` > Monitor > Logs에서
`incident_analysis_started` -> `incident_context_collected` -> `incident_analysis_completed`
(또는 실패 시 `incident_analysis_failed` + `stage`)를 확인한다. `incident_context_collected`
로그의 `metricCount`가 QuizSnapshotFailure는 10, Game Target5xx는 19, API Target5xx는 16인지도
함께 확인한다.

### 2) 실제 장애 기반 end-to-end 테스트

실제로 게임 시작 중 apps/api 응답 지연/장애를 재현해 `quiz_snapshot_failed` 로그가 실제로
쌓이게 한 뒤 QuizSnapshotFailure Alarm이 자연 발생하는 것을 기다린다(Game Target5xx/API
Target5xx는 실제 5xx 트래픽 재현이 필요해 별도로 검증한다). 이 경우에만 Metrics/Logs/Trace가
모두 실데이터로 채워진 분석 품질을 확인할 수 있다. traceId -> X-Ray 변환(`otelTraceIdToXrayTraceId`,
`src/context/collect-traces.ts`)이 실제 CloudWatch Agent의 OTLP->X-Ray 변환과 맞는지는
이 실제 테스트에서만 확인 가능하다(가짜 Alarm 테스트로는 검증되지 않는다). API Target5xx는
추가로 실제 apps/api Log Group에 `path`/`method`/`statusCode`가 기대한 구조로 남는지,
app 예외 로그(`event`/`errorCode`)와 access 로그가 같은 쿼리로 함께 조회되는지도 확인해야
한다 - 가짜 Alarm 테스트는 실제 5xx 트래픽이 없으면 로그가 비어 있을 수 있다.
