variable "route53_zone_id" {
  description = "레코드를 생성할 Route53 호스팅 영역 ID"
  type        = string
}

variable "api_subdomain" {
  description = "ALB를 연결할 서브도메인 (apps/api)"
  type        = string
}

variable "game_subdomain" {
  description = "ALB를 연결할 서브도메인 (apps/game)"
  type        = string
}

variable "domain_name" {
  description = "Route53에 이미 만들어진 호스팅 영역 도메인"
  type        = string
}

variable "lb_dns_name" {
  description = "alias 대상이 될 ALB의 DNS 이름 (load_balancer 모듈 출력)"
  type        = string
}

variable "lb_zone_id" {
  description = "alias 대상이 될 ALB의 Route53 호스팅 영역 ID (load_balancer 모듈 출력)"
  type        = string
}
