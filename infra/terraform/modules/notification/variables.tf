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

variable "game_metric_namespace" {
  description = "Game 서비스 Custom Metric Namespace(modules/logging 출력). recovery_confirm_alarm_signal 알람이 OK로 전환될 때 GameStartSuccess 지표를 조회하는 데 쓴다."
  type        = string
}

variable "recovery_confirm_alarm_signal" {
  description = "OK 전환 시 추가로 성공 횟수를 확인할 알람의 signal(naming convention SongQuiz-Prod-{Severity}-{Service}-{Signal}의 {Signal} 부분). 이 signal이 아닌 알람은 기존처럼 즉시 RECOVERED를 보낸다."
  type        = string
  default     = "QuizSnapshotFailure"
}

variable "recovery_confirm_metric_name" {
  description = "복구 확인에 쓰는 성공 지표 이름(modules/logging/metric-filters.tf의 aws_cloudwatch_log_metric_filter.game_start_success와 일치해야 함)."
  type        = string
  default     = "GameStartSuccess"
}

variable "recovery_confirm_min_count" {
  description = "RECOVERED 알림을 보내기 전 확인하는, 조회 구간(recovery_confirm_lookback_minutes) 내 최소 성공 횟수."
  type        = number
  default     = 5
}

variable "recovery_confirm_lookback_minutes" {
  description = "복구 확인용 성공 횟수를 합산할 조회 구간(분). alarm-notifier가 CloudWatch GetMetricData로 [now - N분, now] 구간의 Sum을 확인한다."
  type        = number
  default     = 10
}
