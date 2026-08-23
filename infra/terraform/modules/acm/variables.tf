variable "project_name" {
  description = "리소스 이름/태그에 사용할 프로젝트 식별자"
  type        = string
}

variable "domain_name" {
  description = "Route53에 이미 만들어진 호스팅 영역 도메인"
  type        = string
}

variable "route53_zone_id" {
  description = "검증용 레코드를 생성할 Route53 호스팅 영역 ID"
  type        = string
}
