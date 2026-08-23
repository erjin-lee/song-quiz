variable "domain_name" {
  description = "Route53에 이미 만들어진 호스팅 영역 도메인"
  type        = string
}

variable "route53_zone_id" {
  description = "레코드를 생성할 Route53 호스팅 영역 ID"
  type        = string
}
