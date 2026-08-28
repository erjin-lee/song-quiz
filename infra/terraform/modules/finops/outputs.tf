output "budget_name" {
  description = "생성된 월간 Budget 이름 (AWS Budgets 콘솔 확인용)"
  value       = aws_budgets_budget.monthly.name
}

output "anomaly_monitor_arn" {
  description = "Cost Anomaly Monitor ARN"
  value       = aws_ce_anomaly_monitor.all_services.arn
}
