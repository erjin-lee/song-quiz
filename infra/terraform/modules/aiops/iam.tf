# Lambda가 맡을 최소 권한 역할. modules/notification/iam.tf와 동일한 패턴("필요한 액션만,
# Resource도 최대한 좁힌다")을 따른다. AIOps v1은 read-only analysis Lambda다(§26) -
# EC2/RDS/Redis 조작, SSM SendCommand, PutMetricData/PutTraceSegments/logs:Delete* 등은
# 어떤 정책에도 포함하지 않는다.
resource "aws_iam_role" "incident_analyzer" {
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
resource "aws_iam_role_policy" "incident_analyzer_logs" {
  name = "${local.function_name}-logs"
  role = aws_iam_role.incident_analyzer.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ]
        Resource = "${aws_cloudwatch_log_group.incident_analyzer.arn}:*"
      }
    ]
  })
}

# 실제 배포된 Alarm 평가 조건(threshold/period/evaluationPeriods 등, §4~5)을 조회하는
# 권한. DescribeAlarms는 (GetMetricData/BatchGetTraces와 달리) alarm 리소스 수준 권한을
# 지원해 QuizSnapshotFailure Alarm 하나로 Resource를 좁힐 수 있다.
resource "aws_iam_role_policy" "incident_analyzer_alarm_definition" {
  name = "${local.function_name}-alarm-definition"
  role = aws_iam_role.incident_analyzer.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "cloudwatch:DescribeAlarms"
        Resource = "arn:aws:cloudwatch:${var.aws_region}:${data.aws_caller_identity.current.account_id}:alarm:${var.target_alarm_name}"
      }
    ]
  })
}

# QuizSnapshotFailure/API·Game 5xx·Latency/RDS CPU·Connections를 조회하는 GetMetricData만
# 허용한다. cloudwatch:PutMetricData(쓰기)는 이 Lambda가 하지 않으므로 포함하지 않는다.
# GetMetricData는 리소스 수준 권한을 지원하지 않는 액션이라(cloudwatch:PutMetricData와 같은
# 이유, modules/iam/main.tf 참고) Resource가 "*"일 수밖에 없다.
resource "aws_iam_role_policy" "incident_analyzer_cloudwatch_metrics" {
  name = "${local.function_name}-cloudwatch-metrics"
  role = aws_iam_role.incident_analyzer.id

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

# CloudWatch Logs Insights 조회 권한. logs:StartQuery는 로그 그룹 ARN으로 리소스 수준 제한이
# 가능해 apps/game Log Group 하나로 좁힌다. logs:GetQueryResults는 쿼리 실행 결과를 queryId로만
# 식별하는 액션이라(로그 그룹 ARN과 무관) 리소스 수준 권한을 지원하지 않아 Resource가 "*"다.
resource "aws_iam_role_policy" "incident_analyzer_logs_insights" {
  name = "${local.function_name}-logs-insights"
  role = aws_iam_role.incident_analyzer.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "logs:StartQuery"
        Resource = "${var.game_log_group_arn}:*"
      },
      {
        Effect   = "Allow"
        Action   = "logs:GetQueryResults"
        Resource = "*"
      }
    ]
  })
}

# quiz_snapshot_failed 로그의 traceId로 관련 X-Ray Trace를 조회하는 읽기 권한만 준다.
# xray:PutTraceSegments/PutTelemetryRecords(쓰기), 샘플링 규칙 조회 등은 이 Lambda가 쓰지
# 않으므로 포함하지 않는다. BatchGetTraces도 리소스 수준 권한을 지원하지 않아 Resource는 "*"다.
resource "aws_iam_role_policy" "incident_analyzer_xray_read" {
  name = "${local.function_name}-xray-read"
  role = aws_iam_role.incident_analyzer.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "xray:BatchGetTraces"
        Resource = "*"
      }
    ]
  })
}

# Slack Webhook URL(alarm-notifier와 동일 Parameter 재사용, §25), OpenAI API Key,
# API/Game Deployment Metadata(§11, §19) - 정확히 이 4개 Parameter만 조회할 수 있게
# Resource를 좁힌다. Deployment Metadata는 secret이 아니지만(String) 최소 권한 원칙은
# 동일하게 적용한다.
resource "aws_iam_role_policy" "incident_analyzer_ssm" {
  name = "${local.function_name}-ssm"
  role = aws_iam_role.incident_analyzer.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = "ssm:GetParameter"
        Resource = [
          "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${var.slack_webhook_parameter_name}",
          "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${var.openai_api_key_parameter_name}",
          "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${var.api_deployment_parameter_name}",
          "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${var.game_deployment_parameter_name}",
        ]
      }
    ]
  })
}
