variable "project_name" {
  description = "리소스 이름/태그에 사용할 프로젝트 식별자"
  type        = string
}

variable "vpc_id" {
  description = "보안 그룹을 생성할 VPC ID"
  type        = string
}

variable "app_port" {
  description = "apps/api(일반 REST) 서버가 사용하는 포트"
  type        = number
}

variable "game_port" {
  description = "apps/game(room + Socket.IO) 서버가 사용하는 포트"
  type        = number
}

variable "db_port" {
  description = "데이터베이스가 사용하는 포트"
  type        = number
}

variable "bastion_security_group_id" {
  description = "app 보안 그룹이 SSH를 허용할 bastion 보안 그룹 ID (compute 모듈 출력)"
  type        = string
}
