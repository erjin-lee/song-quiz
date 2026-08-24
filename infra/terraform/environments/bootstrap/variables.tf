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

# modules/aiops의 동일 이름 변수와 기본값을 반드시 같게 유지한다 - 이 값이 실제 SSM
# Parameter 이름의 source of truth이고, 두 Terraform root(bootstrap/prod)가 서로 다른
# state를 쓰기 때문에 리소스 참조 대신 값(기본값)을 그대로 맞춰 쓴다.
variable "api_deployment_parameter_name" {
  description = "apps/api Production 배포 metadata가 저장될 SSM Parameter 이름(modules/aiops와 동일 값)"
  type        = string
  default     = "/song-quiz/prod/deployment/api"
}

variable "game_deployment_parameter_name" {
  description = "apps/game Production 배포 metadata가 저장될 SSM Parameter 이름(modules/aiops와 동일 값)"
  type        = string
  default     = "/song-quiz/prod/deployment/game"
}
