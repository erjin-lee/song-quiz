output "api_domain" {
  description = "ALB에 연결된 API 도메인"
  value       = aws_route53_record.api.name
}

output "game_domain" {
  description = "ALB에 연결된 Game 서비스 도메인"
  value       = aws_route53_record.game.name
}
