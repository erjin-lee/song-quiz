# Lambda가 맡을 최소 권한 역할. modules/iam/main.tf(app_a 인스턴스 역할)의 "필요한 액션만,
# Resource도 최대한 좁힌다" 패턴을 그대로 따른다.
resource "aws_iam_role" "alarm_notifier" {
  name = local.function_name

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = {
    Name = local.function_name
  }
}

# Terraform이 로그 그룹을 미리 만들어두므로(lambda.tf) logs:CreateLogGroup은 필요 없다.
resource "aws_iam_role_policy" "alarm_notifier_logs" {
  name = "${local.function_name}-logs"
  role = aws_iam_role.alarm_notifier.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ]
        Resource = "${aws_cloudwatch_log_group.alarm_notifier.arn}:*"
      }
    ]
  })
}

# Slack Webhook URL이 저장된 SSM Parameter 정확히 하나만 조회할 수 있게 Resource를 좁힌다.
resource "aws_iam_role_policy" "alarm_notifier_ssm" {
  name = "${local.function_name}-ssm"
  role = aws_iam_role.alarm_notifier.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "ssm:GetParameter"
        Resource = "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${var.slack_webhook_parameter_name}"
      }
    ]
  })
}
