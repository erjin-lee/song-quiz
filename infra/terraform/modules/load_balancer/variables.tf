variable "project_name" {
  description = "리소스 이름/태그에 사용할 프로젝트 식별자"
  type        = string
}

variable "vpc_id" {
  description = "타겟그룹을 생성할 VPC ID"
  type        = string
}

variable "public_subnet_ids" {
  description = "ALB를 배치할 퍼블릭 서브넷 ID 목록 (network 모듈 출력)"
  type        = list(string)
}

variable "public_security_group_id" {
  description = "ALB에 붙일 보안 그룹 ID (security 모듈 출력)"
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

variable "alb_health_check_path" {
  description = "ALB 타겟그룹 헬스체크 경로"
  type        = string
}

variable "app_instance_id" {
  description = "타겟그룹에 붙일 앱 서버(app_a) 인스턴스 ID (compute 모듈 출력)"
  type        = string
}

variable "certificate_arn" {
  description = "HTTPS 리스너에 붙일 ACM 인증서 ARN (acm 모듈 출력)"
  type        = string
}

variable "game_subdomain" {
  description = "apps/game 트래픽을 구분할 서브도메인"
  type        = string
}

variable "domain_name" {
  description = "Route53에 이미 만들어진 호스팅 영역 도메인"
  type        = string
}
