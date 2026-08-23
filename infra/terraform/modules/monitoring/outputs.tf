output "dashboard_name" {
  description = "생성된 CloudWatch Dashboard 이름"
  value       = aws_cloudwatch_dashboard.main.dashboard_name
}
