variable "project_name" {
  description = "리소스 이름/태그에 사용할 프로젝트 식별자"
  type        = string
}

variable "vpc_id" {
  description = "cache 보안 그룹을 생성할 VPC ID"
  type        = string
}

variable "private_db_subnet_ids" {
  description = "ElastiCache를 배치할 서브넷 ID 목록 (network 모듈 출력, DB 계층과 공유)"
  type        = list(string)
}

variable "app_security_group_id" {
  description = "Redis 접근을 허용할 app 보안 그룹 ID (security 모듈 출력)"
  type        = string
}

variable "ecs_api_security_group_id" {
  description = "Redis 접근을 허용할 apps/api ECS Fargate 보안 그룹 ID (security 모듈 출력, ECS Fargate 이관 2단계)"
  type        = string
}

variable "ecs_game_security_group_id" {
  description = "Redis 접근을 허용할 apps/game ECS Fargate 보안 그룹 ID (security 모듈 출력, ECS Fargate 이관 4단계)"
  type        = string
}

variable "cache_port" {
  description = "Redis 포트"
  type        = number
}

variable "cache_engine_version" {
  description = "ElastiCache Redis 엔진 버전"
  type        = string
}

variable "cache_node_type" {
  description = "ElastiCache 노드 타입"
  type        = string
}
