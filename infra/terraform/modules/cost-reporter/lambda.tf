locals {
  function_name = "${var.name_prefix}-cost-reporter"
}

data "aws_caller_identity" "current" {}

# apps/lambda/cost-reporter의 tsc 빌드 산출물(JS만, node_modules 없음)을 그대로 zip으로
# 묶는다. alarm-notifier와 동일하게 @aws-sdk/client-cost-explorer/client-ssm은 Lambda
# Node.js 관리형 런타임이 이미 제공해 번들링하지 않는다(apps/lambda/cost-reporter/README.md 참고).
data "archive_file" "cost_reporter" {
  type        = "zip"
  source_dir  = var.lambda_dist_path
  output_path = "${path.module}/build/cost-reporter.zip"
}

# alarm-notifier/incident-analyzer와 동일한 이유로 Lambda가 스스로 로그 그룹을 만들게 두지
# 않고(logs:CreateLogGroup 권한을 안 주기 위해) Terraform이 먼저 만들어둔다.
resource "aws_cloudwatch_log_group" "cost_reporter" {
  name              = "/aws/lambda/${local.function_name}"
  retention_in_days = var.log_retention_days

  tags = {
    Name = local.function_name
  }
}

resource "aws_lambda_function" "cost_reporter" {
  function_name = local.function_name
  role          = aws_iam_role.cost_reporter.arn
  handler       = "handler.handler"
  runtime       = "nodejs24.x"
  # Cost Explorer GetCostAndUsage를 최대 3번(전일/이번 달 누적/서비스별) 순차 호출 +
  # GetCostForecast 1번 + Slack 전송까지 하는 흐름이라 alarm-notifier(10초)보다는 여유를
  # 둔다. incident-analyzer(60초)만큼 무거운 흐름은 아니라 30초로 설정한다.
  timeout     = 30
  memory_size = 128

  filename         = data.archive_file.cost_reporter.output_path
  source_code_hash = data.archive_file.cost_reporter.output_base64sha256

  # alarm-notifier(modules/notification/lambda.tf)와 동일한 이유 - .github/workflows/
  # deploy-cost-reporter.yml이 코드를 직접 배포하므로, 로컬 terraform apply가 그 코드를
  # 예전 dist/ 기준 zip으로 되돌리지 않도록 무시한다.
  lifecycle {
    ignore_changes = [filename, source_code_hash]
  }

  # Cost Explorer/SSM/Slack Webhook 모두 공인 API라 RDS/Redis/private EC2 접근이 필요 없다
  # - VPC에 넣지 않아 NAT Gateway 비용/복잡도를 추가하지 않는다(alarm-notifier와 동일 이유).
  environment {
    variables = {
      SLACK_WEBHOOK_PARAMETER_NAME = var.slack_webhook_parameter_name
    }
  }

  depends_on = [aws_cloudwatch_log_group.cost_reporter]

  tags = {
    Name    = local.function_name
    Service = "finops"
  }
}
