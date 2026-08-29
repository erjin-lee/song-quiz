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

variable "api_ecs_health_check_path" {
  description = "app_ecs 타겟그룹(ECS Fargate) 헬스체크 경로 - readiness(DB/Redis 연결 확인)를 쓴다. 기존 EC2 app 타겟그룹은 계속 alb_health_check_path(liveness)를 쓴다"
  type        = string
  default     = "/ready"
}

variable "api_traffic_target" {
  description = "ALB HTTPS 리스너 default_action이 API 트래픽을 보낼 대상. \"ec2\"(app_a, 기존) 또는 \"ecs\"(Fargate, 신규). ECS 이관 2단계 컷오버 스위치 - environments/prod의 동일 이름 변수 참고"
  type        = string

  validation {
    condition     = contains(["ec2", "ecs"], var.api_traffic_target)
    error_message = "api_traffic_target은 \"ec2\" 또는 \"ecs\"만 허용합니다."
  }
}

variable "game_ecs_health_check_path" {
  description = "game_ecs 타겟그룹(ECS Fargate) 헬스체크 경로 - readiness(Redis 연결 확인)를 쓴다. 기존 EC2 game 타겟그룹은 계속 alb_health_check_path(liveness)를 쓴다"
  type        = string
  default     = "/ready"
}

variable "game_traffic_target" {
  description = "game 리스너 규칙이 Game 트래픽을 보낼 대상. \"ec2\"(app_a, 기존/기본값) 또는 \"ecs\"(Fargate, 신규). ECS 이관 4단계 컷오버 스위치 - environments/prod의 동일 이름 변수 참고"
  type        = string

  validation {
    condition     = contains(["ec2", "ecs"], var.game_traffic_target)
    error_message = "game_traffic_target은 \"ec2\" 또는 \"ecs\"만 허용합니다."
  }
}
