variable "name_prefix" {
  description = "Lambda function / IAM Role / EventBridge Rule 이름에 쓸 prefix"
  type        = string
  default     = "song-quiz-prod"
}

variable "alarm_name_prefix" {
  description = "이 프로젝트 CloudWatch Alarm 이름 prefix (modules/monitoring/alarms.tf의 naming convention과 반드시 일치해야 함). EventBridge event pattern의 prefix 필터와 Lambda 쪽 방어적 재검증에 함께 쓴다."
  type        = string
  default     = "SongQuiz-Prod-"
}

variable "aws_region" {
  description = "Slack Webhook SSM Parameter의 ARN을 구성하는 데 쓰는 AWS 리전"
  type        = string
}

variable "slack_webhook_parameter_name" {
  description = "Slack Incoming Webhook URL이 저장된 SSM Parameter Store 이름(SecureString). Terraform은 이 이름만 알고, 실제 값은 사용자가 AWS CLI/Console로 별도 등록한다."
  type        = string
  default     = "/song-quiz/prod/slack/alarm-webhook-url"
}

variable "lambda_dist_path" {
  description = "alarm-notifier Lambda의 tsc 빌드 산출물(dist) 디렉터리 절대경로. terraform plan/apply 전에 `yarn workspace alarm-notifier build`로 먼저 만들어야 한다(archive_file이 이 경로를 그대로 zip으로 묶음)."
  type        = string
}

variable "log_retention_days" {
  description = "Lambda CloudWatch Log Group 보존 기간(일)"
  type        = number
  default     = 14
}
