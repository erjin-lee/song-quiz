output "function_name" {
  description = "cost-reporter Lambda 함수 이름"
  value       = aws_lambda_function.cost_reporter.function_name
}

output "function_arn" {
  description = "cost-reporter Lambda 함수 ARN"
  value       = aws_lambda_function.cost_reporter.arn
}
