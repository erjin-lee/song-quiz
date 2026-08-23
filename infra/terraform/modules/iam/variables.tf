variable "project_name" {
  description = "리소스 이름/태그에 사용할 프로젝트 식별자"
  type        = string
}

variable "ses_domain_identity_arn" {
  description = "SES 발신 권한을 제한할 도메인 identity ARN (ses 모듈 출력)"
  type        = string
}

variable "api_log_group_arn" {
  description = "CloudWatch Agent 쓰기 권한을 제한할 apps/api Log Group ARN (logging 모듈 출력)"
  type        = string
}

variable "game_log_group_arn" {
  description = "CloudWatch Agent 쓰기 권한을 제한할 apps/game Log Group ARN (logging 모듈 출력)"
  type        = string
}

variable "ec2_metric_namespace" {
  description = "CloudWatch Agent가 EC2 Memory/Disk 지표를 보낼 namespace. environments/prod/cloudwatch-agent/amazon-cloudwatch-agent.json의 metrics.namespace와 반드시 같은 값이어야 한다"
  type        = string
  default     = "SongQuiz/EC2"
}
