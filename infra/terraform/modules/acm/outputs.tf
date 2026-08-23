output "certificate_arn" {
  description = "발급된 ACM 인증서 ARN"
  value       = aws_acm_certificate_validation.main.certificate_arn
}

output "validation_record_names" {
  description = "이 인증서 검증용으로 만든 Route53 레코드 이름 목록 (web 모듈이 중복 생성을 피하는 데 사용)"
  # aws_route53_record.cert_validation[*].name(생성된 레코드, AWS가 끝에 "."을 붙여 정규화함)이
  # 아니라 local.cert_validation_records[*].name(ACM domain_validation_options 원본 값, "." 없음)을
  # 써야 한다. web 모듈은 자신의 인증서에서 얻은 원본 dvo.resource_record_name과 비교하므로,
  # 형식이 다르면 이미 존재하는 레코드를 못 알아보고 중복 생성을 시도한다.
  value = [for v in local.cert_validation_records : v.name]
}
