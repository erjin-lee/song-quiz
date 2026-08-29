variable "name_prefix" {
  description = "Lambda function / IAM Role / EventBridge Rule 이름에 쓸 prefix"
  type        = string
  default     = "song-quiz-prod"
}

variable "aws_region" {
  description = "SSM Parameter의 ARN을 구성하는 데 쓰는 AWS 리전"
  type        = string
}

variable "quiz_snapshot_failure_alarm_name" {
  description = "QuizSnapshotFailure 분석 대상 Alarm 이름(정확히 일치). EventBridge event pattern과 Lambda 쪽 방어적 재검증에 함께 쓴다."
  type        = string
  default     = "SongQuiz-Prod-High-Game-QuizSnapshotFailure"
}

# v1-2: Game Target5xx ALARM 확장(§AIOps v1-2) - 기존 target_alarm_name(단일 변수)을
# quiz_snapshot_failure_alarm_name으로 이름만 바꾸고, 새 Alarm용 변수를 하나 더 둔다.
# 세 번째 Alarm(API Target5xx 등)이 추가될 때 이 방식이 계속 늘어나면 그때 범용화를
# 다시 검토한다 - 지금은(§v1-2 최소 공통화) 변수 하나 추가로 충분하다.
variable "game_target_5xx_alarm_name" {
  description = "Game Target5xx 분석 대상 Alarm 이름(정확히 일치). EventBridge event pattern과 Lambda 쪽 방어적 재검증에 함께 쓴다."
  type        = string
  default     = "SongQuiz-Prod-High-Game-Target5xx"
}

# v1-3: API Target5xx ALARM 확장(§AIOps v1-3) - v1-2와 동일한 패턴으로 변수 하나만 추가한다.
# 이 변수는 EC2 app 타겟그룹의 Target5xx Alarm을 가리킨다 - api_traffic_target이 "ec2"이거나
# 롤백 기간에 실제로 ALARM이 되는 쪽이다.
variable "api_target_5xx_alarm_name" {
  description = "API Target5xx(EC2 app 타겟그룹) 분석 대상 Alarm 이름(정확히 일치). EventBridge event pattern과 Lambda 쪽 방어적 재검증에 함께 쓴다."
  type        = string
  default     = "SongQuiz-Prod-High-API-Target5xx"
}

# 3단계(ECS Fargate 이관) - ECS app_ecs 타겟그룹의 Target5xx Alarm(modules/monitoring의
# local.alarm_target_groups.api_ecs가 만드는 것과 같은 이름). api_target_5xx_alarm_name과
# 별개 Alarm이지만 incident-policy.ts의 IncidentPolicy.additionalAlarms를 통해 같은
# API_TARGET_5XX IncidentType으로 취급된다 - api_traffic_target이 "ecs"로 전환된 뒤에는
# 이쪽이 실제로 ALARM이 된다.
variable "api_ecs_target_5xx_alarm_name" {
  description = "API Target5xx(ECS app_ecs 타겟그룹) 분석 대상 Alarm 이름(정확히 일치). EventBridge event pattern과 Lambda 쪽 방어적 재검증에 함께 쓴다."
  type        = string
  default     = "SongQuiz-Prod-High-API-ECS-Target5xx"
}

variable "lambda_dist_path" {
  description = "incident-analyzer Lambda의 빌드 산출물(dist) 디렉터리 절대경로. terraform plan/apply 전에 `yarn workspace incident-analyzer build`로 먼저 만들어야 한다(archive_file이 이 경로를 그대로 zip으로 묶음)."
  type        = string
}

variable "log_retention_days" {
  description = "Lambda CloudWatch Log Group 보존 기간(일)"
  type        = number
  default     = 14
}

variable "game_log_group_name" {
  description = "CloudWatch Logs Insights로 조회할 apps/game Log Group 이름(logging 모듈 출력)"
  type        = string
}

variable "game_log_group_arn" {
  description = "logs:StartQuery 권한을 제한할 apps/game Log Group ARN(logging 모듈 출력)"
  type        = string
}

# API Target5xx(§AIOps v1-3)의 Logs Insights 조회 대상 - apps/api Log Group. 이 값에는
# 기본값을 두지 않는다(game_log_group_name/arn과 동일하게 logging 모듈 출력을 그대로 전달받는
# 필수 값이라 잘못된 기본값을 두는 것보다 명시적으로 누락을 드러내는 편이 안전하다).
variable "api_log_group_name" {
  description = "CloudWatch Logs Insights로 조회할 apps/api Log Group 이름(logging 모듈 출력)"
  type        = string
}

variable "api_log_group_arn" {
  description = "logs:StartQuery 권한을 제한할 apps/api Log Group ARN(logging 모듈 출력)"
  type        = string
}

variable "game_metric_namespace" {
  description = "QuizSnapshotFailure Custom Metric의 namespace(logging 모듈 출력) - monitoring 모듈 Dashboard와 값이 갈라지지 않도록 여기서 새로 정의하지 않고 그대로 전달받는다"
  type        = string
}

variable "alb_arn_suffix" {
  description = "ALB의 arn_suffix(load_balancer 모듈 출력)"
  type        = string
}

variable "api_target_group_arn_suffix" {
  description = "apps/api EC2 app 타겟그룹의 arn_suffix(load_balancer 모듈 출력)"
  type        = string
}

# 3단계(ECS Fargate 이관) - api_target_group_arn_suffix(EC2 app 타겟그룹)와 별개로 ECS
# app_ecs 타겟그룹의 트래픽/5xx/지연시간도 조회한다. monitoring 모듈에 이미 전달하는 것과
# 동일한 값을 그대로 재사용한다.
variable "api_ecs_target_group_arn_suffix" {
  description = "apps/api ECS Fargate 타겟그룹(app_ecs)의 arn_suffix(load_balancer 모듈 출력)"
  type        = string
}

variable "game_target_group_arn_suffix" {
  description = "apps/game 타겟그룹의 arn_suffix(load_balancer 모듈 출력)"
  type        = string
}

variable "db_instance_identifier" {
  description = "RDS 인스턴스 식별자(database 모듈 출력)"
  type        = string
}

# Game Target5xx 분석(§AIOps v1-2)의 EC2/Redis Metric 조회용 - monitoring 모듈이 Dashboard에
# 쓰는 것과 동일한 값을 그대로 전달받는다(새 값을 여기서 새로 정의하지 않는다).
variable "ec2_instance_id" {
  description = "app_a EC2 인스턴스 ID(compute 모듈 출력) - EC2 CPU/Memory Metric의 InstanceId dimension"
  type        = string
}

variable "ec2_metric_namespace" {
  description = "CloudWatch Agent EC2 Memory 지표의 namespace(iam 모듈 출력)"
  type        = string
}

variable "cache_cluster_id" {
  description = "ElastiCache 클러스터 ID(cache 모듈 출력) - Redis Memory/Connections/Evictions Metric의 CacheClusterId dimension"
  type        = string
}

# API Target5xx 분석(3단계, ECS Fargate 이관)의 API 런타임 Metric 조회용 - API가 ECS로
# 전환된 뒤에는 EC2 CPU/Memory 대신 이 값들로 AWS/ECS CPUUtilization/MemoryUtilization을
# 조회한다(ecs 모듈 출력, monitoring 모듈이 이미 쓰는 것과 동일한 값).
variable "ecs_cluster_name" {
  description = "ECS 클러스터 이름(ecs 모듈 출력) - AWS/ECS Metric의 ClusterName dimension"
  type        = string
}

variable "ecs_api_service_name" {
  description = "apps/api ECS 서비스 이름(ecs 모듈 출력) - AWS/ECS Metric의 ServiceName dimension"
  type        = string
}

variable "slack_webhook_parameter_name" {
  description = "Slack Incoming Webhook URL이 저장된 SSM Parameter 이름(SecureString). alarm-notifier(modules/notification)와 같은 채널을 재사용하므로 기본값을 그 모듈의 기본값과 동일하게 둔다(§25) - 별도 AIOps 전용 Webhook을 새로 만들지 않는다."
  type        = string
  default     = "/song-quiz/prod/slack/alarm-webhook-url"
}

variable "openai_api_key_parameter_name" {
  description = "OpenAI API Key가 저장된 SSM Parameter 이름(SecureString). 실제 값은 Terraform 밖에서 사용자가 별도로 등록한다(§19)."
  type        = string
  default     = "/song-quiz/prod/openai/api-key"
}

variable "openai_model" {
  description = "OpenAI 모델 이름. 코드에 하드코딩하지 않고 Lambda 환경변수로 주입한다(§18) - 비용을 고려해 apps/api의 GPT 채점용 모델(gpt-5.6-luna)보다 가벼운 모델을 기본값으로 둔다."
  type        = string
  default     = "gpt-5.6-luna"
}

# Deployment Metadata(§11~19) - Terraform이 이 SSM Parameter 리소스 자체를 만들지는 않는다.
# API/Game deploy workflow(.github/workflows/deploy-*.yml)가 매 배포 성공 후 실제 값을 쓰고,
# 이 Lambda는 그 값을 읽기만 한다(Slack Webhook/OpenAI API Key와 동일하게, ARN만 알고
# 실제 값 생성/관리는 Terraform 밖에서 이루어지는 패턴 - README 참고).
variable "api_deployment_parameter_name" {
  description = "apps/api Production 배포 metadata(commit/PR)가 저장된 SSM Parameter 이름(String, secret 아님)"
  type        = string
  default     = "/song-quiz/prod/deployment/api"
}

variable "game_deployment_parameter_name" {
  description = "apps/game Production 배포 metadata(commit/PR)가 저장된 SSM Parameter 이름(String, secret 아님)"
  type        = string
  default     = "/song-quiz/prod/deployment/game"
}
