variable "project_name" {
  description = "리소스 이름/태그에 사용할 프로젝트 식별자"
  type        = string
}

variable "ses_domain_identity_arn" {
  description = "SES 발신 권한을 제한할 도메인 identity ARN (ses 모듈 출력)"
  type        = string
}
