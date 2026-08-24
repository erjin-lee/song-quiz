variable "name_prefix" {
  description = "Lambda function / IAM Role / EventBridge Rule 이름에 쓸 prefix"
  type        = string
  default     = "song-quiz-prod"
}

variable "aws_region" {
  description = "SSM Parameter의 ARN을 구성하는 데 쓰는 AWS 리전"
  type        = string
}

variable "target_alarm_name" {
  description = "AI 분석 대상 Alarm 이름(정확히 일치). EventBridge event pattern과 Lambda 쪽 방어적 재검증에 함께 쓴다 - 이번 단계는 QuizSnapshotFailure 하나만 대상으로 한다(§5)."
  type        = string
  default     = "SongQuiz-Prod-High-Game-QuizSnapshotFailure"
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

variable "game_metric_namespace" {
  description = "QuizSnapshotFailure Custom Metric의 namespace(logging 모듈 출력) - monitoring 모듈 Dashboard와 값이 갈라지지 않도록 여기서 새로 정의하지 않고 그대로 전달받는다"
  type        = string
}

variable "alb_arn_suffix" {
  description = "ALB의 arn_suffix(load_balancer 모듈 출력)"
  type        = string
}

variable "api_target_group_arn_suffix" {
  description = "apps/api 타겟그룹의 arn_suffix(load_balancer 모듈 출력)"
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
