output "lambda_function_name" {
  description = "incident-analyzer Lambda 함수 이름"
  value       = aws_lambda_function.incident_analyzer.function_name
}

output "lambda_function_arn" {
  description = "incident-analyzer Lambda 함수 ARN"
  value       = aws_lambda_function.incident_analyzer.arn
}

output "eventbridge_rule_arn" {
  description = "QuizSnapshotFailure/Game Target5xx ALARM 전용 EventBridge Rule ARN"
  value       = aws_cloudwatch_event_rule.quiz_snapshot_failure_alarm.arn
}

output "openai_api_key_parameter_name" {
  description = "OpenAI API Key를 등록해야 하는 SSM Parameter 이름 (실제 값은 Terraform 밖에서 사용자가 등록)"
  value       = var.openai_api_key_parameter_name
}
