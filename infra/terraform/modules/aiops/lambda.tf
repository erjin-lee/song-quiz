locals {
  function_name = "${var.name_prefix}-incident-analyzer"
}

data "aws_caller_identity" "current" {}

# apps/lambda/incident-analyzer의 esbuild 번들 산출물(dist/handler.js 하나, openai 포함)을
# 그대로 zip으로 묶는다. alarm-notifier와 달리 openai는 Lambda 런타임이 제공하지 않아
# 번들에 포함되어야 하므로(apps/lambda/incident-analyzer/README.md 참고), tsc가 아니라
# esbuild 산출물을 사용한다. @aws-sdk/*는 런타임이 제공해 번들에서 제외된다.
data "archive_file" "incident_analyzer" {
  type        = "zip"
  source_dir  = var.lambda_dist_path
  output_path = "${path.module}/build/incident-analyzer.zip"
}

# alarm-notifier(modules/notification/lambda.tf)와 동일한 이유로 Lambda가 스스로 로그
# 그룹을 만들게 두지 않고(logs:CreateLogGroup 권한을 안 주기 위해) Terraform이 먼저 만든다.
resource "aws_cloudwatch_log_group" "incident_analyzer" {
  name              = "/aws/lambda/${local.function_name}"
  retention_in_days = var.log_retention_days

  tags = {
    Name = local.function_name
  }
}

resource "aws_lambda_function" "incident_analyzer" {
  function_name = local.function_name
  role          = aws_iam_role.incident_analyzer.arn
  handler       = "handler.handler"
  runtime       = "nodejs24.x"
  # Metrics/Logs Insights(polling 포함)/X-Ray 조회 후 OpenAI/Slack까지 순차 호출하는
  # 여러 단계짜리 흐름이라 alarm-notifier(10초)보다 훨씬 오래 걸릴 수 있다(§28). Logs
  # Insights polling 상한(최대 10초, apps/lambda/incident-analyzer/src/context/collect-logs.ts)과
  # OpenAI 호출 worst case(재시도 포함 최대 40초, analyze-incident.ts)를 더해도 60초 안에
  # 끝나도록 여유를 두고 60초로 설정한다 - AWS Lambda 최대값인 15분까지 늘리지 않는다.
  timeout = 60
  # X-Ray segment document/Logs Insights 결과 JSON을 메모리에서 다루는 정도라 alarm-notifier
  # (128MB)보다는 여유를 두되, 대량 데이터 처리가 아니므로 256MB로 시작한다.
  memory_size = 256

  filename         = data.archive_file.incident_analyzer.output_path
  source_code_hash = data.archive_file.incident_analyzer.output_base64sha256

  # CloudWatch/Logs/X-Ray/SSM/OpenAI/Slack 모두 공인 API라 RDS/Redis/private EC2 접근이
  # 필요 없다 - VPC에 넣지 않아 NAT Gateway 비용/복잡도를 추가하지 않는다(§27).
  environment {
    variables = {
      TARGET_ALARM_NAME              = var.target_alarm_name
      GAME_LOG_GROUP_NAME            = var.game_log_group_name
      GAME_METRIC_NAMESPACE          = var.game_metric_namespace
      ALB_ARN_SUFFIX                 = var.alb_arn_suffix
      API_TARGET_GROUP_ARN_SUFFIX    = var.api_target_group_arn_suffix
      GAME_TARGET_GROUP_ARN_SUFFIX   = var.game_target_group_arn_suffix
      DB_INSTANCE_IDENTIFIER         = var.db_instance_identifier
      SLACK_WEBHOOK_PARAMETER_NAME   = var.slack_webhook_parameter_name
      OPENAI_API_KEY_PARAMETER_NAME  = var.openai_api_key_parameter_name
      OPENAI_MODEL                   = var.openai_model
      API_DEPLOYMENT_PARAMETER_NAME  = var.api_deployment_parameter_name
      GAME_DEPLOYMENT_PARAMETER_NAME = var.game_deployment_parameter_name
    }
  }

  depends_on = [aws_cloudwatch_log_group.incident_analyzer]

  tags = {
    Name        = local.function_name
    Environment = "prod"
    Service     = "aiops"
  }
}
