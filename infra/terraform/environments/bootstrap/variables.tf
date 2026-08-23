variable "aws_region" {
  description = "리소스를 생성할 AWS 리전"
  type        = string
  default     = "ap-northeast-2"
}

variable "aws_profile" {
  description = "인증에 사용할 AWS CLI 프로필 이름"
  type        = string
  default     = "default"
}

variable "project_name" {
  description = "리소스 이름/태그에 사용할 프로젝트 식별자 (environments/prod와 동일한 값을 쓴다)"
  type        = string
  default     = "deploy-terraform"
}

variable "github_repository" {
  description = "CI(GitHub Actions)에서 terraform plan을 실행할 role을 assume하도록 허용할 저장소 (owner/repo 형식)"
  type        = string
  default     = "erjin-lee/song-quiz"
}
