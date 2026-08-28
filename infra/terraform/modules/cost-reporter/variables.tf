variable "name_prefix" {
  description = "Lambda function / IAM Role / Scheduler 이름에 쓸 prefix"
  type        = string
  default     = "song-quiz-prod"
}

variable "aws_region" {
  description = "Slack Webhook SSM Parameter ARN을 구성하는 데 쓰는 AWS 리전"
  type        = string
}

variable "slack_webhook_parameter_name" {
  description = "Slack Incoming Webhook URL이 저장된 SSM Parameter Store 이름(SecureString). alarm-notifier/incident-analyzer가 이미 쓰는 파라미터를 그대로 재사용한다(§5) - 별도 Webhook을 새로 만들지 않는다."
  type        = string
  default     = "/song-quiz/prod/slack/alarm-webhook-url"
}

variable "lambda_dist_path" {
  description = "cost-reporter Lambda의 tsc 빌드 산출물(dist) 디렉터리 절대경로. terraform plan/apply 전에 `yarn workspace cost-reporter build`로 먼저 만들어야 한다(archive_file이 이 경로를 그대로 zip으로 묶음)."
  type        = string
}

variable "log_retention_days" {
  description = "Lambda CloudWatch Log Group 보존 기간(일)"
  type        = number
  default     = 14
}

variable "schedule_expression" {
  description = "Cost Reporter를 실행할 cron 식(EventBridge Scheduler 형식). Cost Explorer 일별 데이터 반영 지연을 고려해 기본값은 매일 10:00(schedule_expression_timezone 기준)이다."
  type        = string
  default     = "cron(0 10 * * ? *)"
}

variable "schedule_expression_timezone" {
  description = "schedule_expression을 해석할 타임존. EventBridge Scheduler가 IANA 타임존을 직접 지원해 UTC로 수동 변환하지 않는다(§6)."
  type        = string
  default     = "Asia/Seoul"
}
