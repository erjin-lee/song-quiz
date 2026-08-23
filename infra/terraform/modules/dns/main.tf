# api/game 서브도메인을 ALB로 연결하는 Route53 레코드. 원래 루트의 dns.tf 그대로다.

resource "aws_route53_record" "api" {
  zone_id = var.route53_zone_id
  name    = "${var.api_subdomain}.${var.domain_name}"
  type    = "A"

  alias {
    name                   = var.lb_dns_name
    zone_id                = var.lb_zone_id
    evaluate_target_health = true
  }
}

# api 레코드와 같은 ALB를 가리킨다 - 실제 apps/api/apps/game 분기는
# load_balancer 모듈의 aws_lb_listener_rule.game Host 헤더 조건이 담당한다.
resource "aws_route53_record" "game" {
  zone_id = var.route53_zone_id
  name    = "${var.game_subdomain}.${var.domain_name}"
  type    = "A"

  alias {
    name                   = var.lb_dns_name
    zone_id                = var.lb_zone_id
    evaluate_target_health = true
  }
}
