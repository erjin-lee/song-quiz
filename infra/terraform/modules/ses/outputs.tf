output "domain_identity_arn" {
  description = "SES 도메인 identity ARN (IAM 정책에서 발신 권한을 제한하는 데 사용)"
  value       = aws_ses_domain_identity.main.arn
}

output "domain_verified" {
  description = "SES 도메인 인증 완료 여부 (apply가 완료됐다면 항상 true)"
  value       = aws_ses_domain_identity_verification.main.id != "" ? true : false
}
