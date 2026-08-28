# Lambda가 맡을 최소 권한 역할. modules/notification/iam.tf와 동일한 패턴("필요한 액션만,
# Resource도 최대한 좁힌다")을 따른다.
resource "aws_iam_role" "cost_reporter" {
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
resource "aws_iam_role_policy" "cost_reporter_logs" {
  name = "${local.function_name}-logs"
  role = aws_iam_role.cost_reporter.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ]
        Resource = "${aws_cloudwatch_log_group.cost_reporter.arn}:*"
      }
    ]
  })
}

# Slack Webhook URL이 저장된 SSM Parameter 정확히 하나만 조회할 수 있게 Resource를 좁힌다
# (modules/notification/iam.tf와 동일한 패턴).
resource "aws_iam_role_policy" "cost_reporter_ssm" {
  name = "${local.function_name}-ssm"
  role = aws_iam_role.cost_reporter.id

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

# Cost Explorer(ce:*)는 alarm-notifier의 cloudwatch:GetMetricData와 같은 이유로 Resource를
# ARN으로 좁힐 수 없다 - Cost Explorer API 자체가 리소스 단위 ARN 개념이 없는 계정 전체
# API라 IAM에서도 Resource = "*"만 허용된다(AWS 문서 기준). 대신 Action을 실제로 쓰는
# 두 개(GetCostAndUsage/GetCostForecast)로만 좁혀서 §7의 "ce:* 같은 광범위 권한 금지"를
# 지킨다.
resource "aws_iam_role_policy" "cost_reporter_cost_explorer" {
  name = "${local.function_name}-cost-explorer"
  role = aws_iam_role.cost_reporter.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ce:GetCostAndUsage",
          "ce:GetCostForecast",
        ]
        Resource = "*"
      }
    ]
  })
}
