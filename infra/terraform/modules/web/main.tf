# 웹 정적 파일(S3) + CloudFront 배포. 원래 루트의 web.tf 그대로다.

# apps/web(사용자 웹) 전용 정적 호스팅 리소스라 api/game과 구분되는 Service = "web"로 태그한다.
resource "aws_s3_bucket" "web" {
  bucket = "${replace(var.domain_name, ".", "-")}-web"

  tags = {
    Name    = "${var.project_name}-web"
    Service = "web"
  }
}

resource "aws_s3_bucket_public_access_block" "web" {
  bucket = aws_s3_bucket.web.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# CloudFront용 인증서는 us-east-1에서만 발급 가능하다.
resource "aws_acm_certificate" "web" {
  provider = aws.us_east_1

  domain_name       = var.domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = "${var.project_name}-web-cert"
  }
}

# 이 인증서는 도메인이 하나뿐이라(SAN 없음) domain_name 키가 중복될 일이 없다.
# resource_record_name은 신규 인증서라 apply 전엔 알 수 없어 for_each 키로 쓸 수 없다.
#
# acm 모듈의 인증서(ALB용)도 같은 apex 도메인(var.domain_name)을 검증하므로,
# ACM이 요구하는 CNAME 이름/값이 완전히 동일하게 나온다. acm 모듈이 이미 그 레코드를
# 만들었다면 여기서 또 만들면 Route53에서 "already exists" 오류가 난다. 그래서
# var.existing_validation_record_names(acm 모듈 출력)와 이름이 겹치는 항목은 제외한다.
locals {
  web_cert_validation_records = {
    for dvo in aws_acm_certificate.web.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
    if !contains(var.existing_validation_record_names, dvo.resource_record_name)
  }
}

resource "aws_route53_record" "web_cert_validation" {
  for_each = local.web_cert_validation_records

  zone_id = var.route53_zone_id
  name    = each.value.name
  type    = each.value.type
  ttl     = 60
  records = [each.value.record]
}

resource "aws_acm_certificate_validation" "web" {
  provider = aws.us_east_1

  certificate_arn = aws_acm_certificate.web.arn
  validation_record_fqdns = [
    for dvo in aws_acm_certificate.web.domain_validation_options : dvo.resource_record_name
  ]

  # 이 모듈이 새로 만든 레코드에 의존한다. acm 모듈이 이미 만들어 둔 동일한 CNAME에 대한
  # 의존은 module.web의 depends_on = [module.acm] (root main.tf)이 대신 보장한다 -
  # 모듈 경계를 넘는 depends_on은 리소스 단위로 표현할 수 없기 때문이다.
  depends_on = [aws_route53_record.web_cert_validation]
}

resource "aws_cloudfront_origin_access_control" "web" {
  name                              = "${var.project_name}-web"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

resource "aws_cloudfront_distribution" "web" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  price_class         = "PriceClass_100"
  aliases             = [var.domain_name]

  origin {
    domain_name              = aws_s3_bucket.web.bucket_regional_domain_name
    origin_id                = "s3-web"
    origin_access_control_id = aws_cloudfront_origin_access_control.web.id
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "s3-web"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true
    cache_policy_id        = data.aws_cloudfront_cache_policy.caching_optimized.id
  }

  # SPA 라우팅: S3에 없는 경로는 index.html로 돌려주고 200으로 응답한다.
  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }

  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.web.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = {
    Name    = "${var.project_name}-web"
    Service = "web"
  }
}

resource "aws_s3_bucket_policy" "web" {
  bucket = aws_s3_bucket.web.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowCloudFrontServicePrincipal"
        Effect    = "Allow"
        Principal = { Service = "cloudfront.amazonaws.com" }
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.web.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.web.arn
          }
        }
      }
    ]
  })
}

resource "aws_route53_record" "web" {
  zone_id = var.route53_zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.web.domain_name
    zone_id                = aws_cloudfront_distribution.web.hosted_zone_id
    evaluate_target_health = false
  }
}
