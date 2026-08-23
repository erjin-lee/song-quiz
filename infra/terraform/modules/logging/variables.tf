variable "project_name" {
  description = "리소스 이름/태그에 사용할 프로젝트 식별자"
  type        = string
}

variable "log_retention_days" {
  description = "CloudWatch Log Group 보존 기간(일)"
  type        = number
  default     = 14
}

variable "game_metric_namespace" {
  description = "Game 실패 이벤트 Metric Filter가 만드는 Custom Metric의 CloudWatch namespace"
  type        = string
  default     = "SongQuiz/Game"
}
