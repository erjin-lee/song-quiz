variable "project_name" {
  description = "리소스 이름/태그에 사용할 프로젝트 식별자"
  type        = string
}

variable "vpc_id" {
  description = "bastion 보안 그룹을 생성할 VPC ID"
  type        = string
}

variable "public_subnet_a_id" {
  description = "bastion을 배치할 퍼블릭 서브넷 ID (network 모듈 출력)"
  type        = string
}

variable "private_app_subnet_a_id" {
  description = "app_a를 배치할 프라이빗 앱 서브넷 ID (network 모듈 출력)"
  type        = string
}

variable "bastion_public_key_path" {
  description = "Bastion 인스턴스에 등록할 SSH 공개키 파일 경로"
  type        = string
}

variable "bastion_instance_type" {
  description = "Bastion 인스턴스 타입"
  type        = string
}

variable "app_instance_type" {
  description = "앱 서버 인스턴스 타입"
  type        = string
}

variable "app_security_group_id" {
  description = "app_a에 붙일 보안 그룹 ID (security 모듈 출력)"
  type        = string
}

variable "iam_instance_profile_name" {
  description = "app_a에 붙일 IAM 인스턴스 프로파일 이름 (iam 모듈 출력)"
  type        = string
}
