output "api_log_group_name" {
  description = "apps/api PM2 로그용 CloudWatch Log Group 이름 (CloudWatch Agent 설정 파일에 그대로 사용)"
  value       = aws_cloudwatch_log_group.api.name
}

output "api_log_group_arn" {
  description = "apps/api PM2 로그용 CloudWatch Log Group ARN (iam 모듈의 정책 Resource에 사용)"
  value       = aws_cloudwatch_log_group.api.arn
}

output "game_log_group_name" {
  description = "apps/game PM2 로그용 CloudWatch Log Group 이름 (CloudWatch Agent 설정 파일에 그대로 사용)"
  value       = aws_cloudwatch_log_group.game.name
}

output "game_log_group_arn" {
  description = "apps/game PM2 로그용 CloudWatch Log Group ARN (iam 모듈의 정책 Resource에 사용)"
  value       = aws_cloudwatch_log_group.game.arn
}

output "game_metric_namespace" {
  description = "Game 실패 이벤트 Metric Filter의 namespace (monitoring 모듈의 Dashboard가 참조 - metric-filters.tf와 값이 갈라지지 않도록 여기서만 정의)"
  value       = var.game_metric_namespace
}
