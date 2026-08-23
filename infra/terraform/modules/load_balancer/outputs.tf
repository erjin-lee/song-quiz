output "dns_name" {
  description = "ALB의 DNS 이름"
  value       = aws_lb.main.dns_name
}

output "zone_id" {
  description = "ALB의 Route53 호스팅 영역 ID (alias 레코드 생성용)"
  value       = aws_lb.main.zone_id
}

output "arn" {
  description = "ALB의 ARN"
  value       = aws_lb.main.arn
}
