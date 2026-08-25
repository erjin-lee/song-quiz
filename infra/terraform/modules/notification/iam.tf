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

# QuizSnapshotFailure 복구 확인용 GameStartSuccess 지표 조회 권한. GetMetricData는 CloudWatch
# Metric 자체가 ARN으로 존재하지 않는 리소스라 Resource를 "*" 밖에 못 쓴다(AWS IAM 제약).
# cloudwatch:namespace 조건 키는 PutMetricData(쓰기)에만 지원되고 GetMetricData(읽기)에는
# 적용되지 않는다 - 여기 넣으면 조건이 절대 만족되지 않아 항상 AccessDenied가 난다
# (https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/iam-cw-condition-keys-namespace.html
# 예시가 전부 PutMetricData뿐인 것도 이 때문). 그래서 namespace로 더 좁힐 방법이 없고,
# 이 Role은 계정 내 임의 namespace의 지표를 GetMetricData로 읽을 수 있다 - alarm_notifier_ssm처럼
# Resource ARN으로 좁히는 게 불가능한 AWS 쪽 한계다.
resource "aws_iam_role_policy" "alarm_notifier_cloudwatch_metrics" {
  name = "${local.function_name}-cloudwatch-metrics"
  role = aws_iam_role.alarm_notifier.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "cloudwatch:GetMetricData"
        Resource = "*"
      }
    ]
  })
}
