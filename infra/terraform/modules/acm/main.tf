# ALB(apps/api, apps/game)용 와일드카드 인증서. 원래 루트의 acm.tf 그대로다.

resource "aws_acm_certificate" "main" {
  domain_name               = "*.${var.domain_name}"
  subject_alternative_names = [var.domain_name]
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = "${var.project_name}-cert"
  }
}

# 와일드카드 인증서는 검증용 DNS 레코드가 도메인당 1개씩 필요하다 (여기서는 apex + 와일드카드로 2개).
# apex와 와일드카드가 완전히 동일한 CNAME을 요구하는 경우가 있어서, distinct()로 중복 항목을
# 먼저 제거한 뒤 맵을 만들어 중복 생성을 방지한다.
locals {
  cert_validation_records = distinct([
    for dvo in aws_acm_certificate.main.domain_validation_options : {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  ])
}

resource "aws_route53_record" "cert_validation" {
  for_each = { for v in local.cert_validation_records : v.name => v }

  zone_id = var.route53_zone_id
  name    = each.value.name
  type    = each.value.type
  ttl     = 60
  records = [each.value.record]
}

resource "aws_acm_certificate_validation" "main" {
  certificate_arn         = aws_acm_certificate.main.arn
  validation_record_fqdns = [for record in aws_route53_record.cert_validation : record.fqdn]
}
