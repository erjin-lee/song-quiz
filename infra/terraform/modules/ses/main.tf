# SES 도메인 인증 + DKIM. 원래 루트의 ses.tf 그대로다.

# SES에서 이 도메인으로 이메일을 보내려면 먼저 도메인 소유권을 인증해야 한다.
resource "aws_ses_domain_identity" "main" {
  domain = var.domain_name
}

# 인증용 TXT 레코드. SES가 발급한 값을 Route53에 등록하면 AWS가 자동으로 확인한다.
resource "aws_route53_record" "ses_verification" {
  zone_id = var.route53_zone_id
  name    = "_amazonses.${var.domain_name}"
  type    = "TXT"
  ttl     = 600
  records = [aws_ses_domain_identity.main.verification_token]
}

# TXT 레코드가 전파되어 AWS가 실제로 인증을 완료할 때까지 apply가 대기하도록 한다.
resource "aws_ses_domain_identity_verification" "main" {
  domain = aws_ses_domain_identity.main.id

  depends_on = [aws_route53_record.ses_verification]
}

# DKIM 서명을 활성화한다. 수신 서버가 "이 메일이 정말 이 도메인에서 보낸 것"임을
# 암호학적으로 검증할 수 있게 해서 스팸 처리 확률을 낮추고 발신자 신뢰도를 높인다.
resource "aws_ses_domain_dkim" "main" {
  domain = aws_ses_domain_identity.main.domain
}

resource "aws_route53_record" "ses_dkim" {
  count   = 3
  zone_id = var.route53_zone_id
  name    = "${aws_ses_domain_dkim.main.dkim_tokens[count.index]}._domainkey.${var.domain_name}"
  type    = "CNAME"
  ttl     = 600
  records = ["${aws_ses_domain_dkim.main.dkim_tokens[count.index]}.dkim.amazonses.com"]
}
