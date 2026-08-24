output "lambda_function_name" {
  description = "alarm-notifier Lambda 함수 이름"
  value       = aws_lambda_function.alarm_notifier.function_name
}

output "lambda_function_arn" {
  description = "alarm-notifier Lambda 함수 ARN"
  value       = aws_lambda_function.alarm_notifier.arn
}

output "eventbridge_rule_arn" {
  description = "CloudWatch Alarm State Change EventBridge Rule ARN"
  value       = aws_cloudwatch_event_rule.alarm_state_change.arn
}

output "slack_webhook_parameter_name" {
  description = "Slack Webhook URL을 등록해야 하는 SSM Parameter 이름 (실제 값은 Terraform 밖에서 사용자가 등록)"
  value       = var.slack_webhook_parameter_name
}
