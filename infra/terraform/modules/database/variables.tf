variable "project_name" {
  description = "리소스 이름/태그에 사용할 프로젝트 식별자"
  type        = string
}

variable "private_db_subnet_ids" {
  description = "RDS를 배치할 프라이빗 DB 서브넷 ID 목록 (network 모듈 출력)"
  type        = list(string)
}

variable "db_security_group_id" {
  description = "RDS에 붙일 보안 그룹 ID (security 모듈 출력)"
  type        = string
}

variable "db_engine_version" {
  description = "RDS MySQL 엔진 버전"
  type        = string
}

variable "db_instance_class" {
  description = "RDS 인스턴스 클래스"
  type        = string
}

variable "db_allocated_storage" {
  description = "RDS 스토리지 크기(GB)"
  type        = number
}

variable "db_name" {
  description = "생성할 데이터베이스(스키마) 이름"
  type        = string
}

variable "db_username" {
  description = "RDS 마스터 사용자명"
  type        = string
}

variable "db_password" {
  description = "RDS 마스터 비밀번호"
  type        = string
  sensitive   = true
}

variable "db_multi_az" {
  description = "RDS Multi-AZ(대기 복본) 활성화 여부"
  type        = bool
}

variable "db_deletion_protection" {
  description = "RDS 삭제 보호 활성화 여부"
  type        = bool
}
