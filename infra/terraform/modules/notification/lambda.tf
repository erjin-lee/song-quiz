locals {
  function_name = "${var.name_prefix}-alarm-notifier"
}

data "aws_caller_identity" "current" {}

# apps/lambda/alarm-notifier의 tsc 빌드 산출물(JS만, node_modules 없음)을 그대로 zip으로 묶는다.
# @aws-sdk/client-ssm은 Lambda Node.js 20.x 런타임에 기본 포함되어 있어 번들링하지 않는다
# (apps/lambda/alarm-notifier/README.md 참고). output_base64sha256이 코드 내용 기준 해시라
# 소스가 바뀔 때만 aws_lambda_function이 갱신된다(불필요한 재배포 방지).
data "archive_file" "alarm_notifier" {
  type        = "zip"
  source_dir  = var.lambda_dist_path
  output_path = "${path.module}/build/alarm-notifier.zip"
}

# CloudWatch Agent 로그 그룹(modules/logging)과 같은 이유로, Lambda가 스스로 로그 그룹을
# 만들게 두지 않고(logs:CreateLogGroup 권한을 안 주기 위해) Terraform이 먼저 만들어둔다.
resource "aws_cloudwatch_log_group" "alarm_notifier" {
  name              = "/aws/lambda/${local.function_name}"
  retention_in_days = var.log_retention_days

  tags = {
    Name = local.function_name
  }
}

resource "aws_lambda_function" "alarm_notifier" {
  function_name = local.function_name
  role          = aws_iam_role.alarm_notifier.arn
  handler       = "handler.handler"
  runtime       = "nodejs24.x"
  timeout       = 10
  memory_size   = 128

  filename         = data.archive_file.alarm_notifier.output_path
  source_code_hash = data.archive_file.alarm_notifier.output_base64sha256

  # .github/workflows/deploy-alarm-notifier.yml이 main에 merge된 코드를
  # aws lambda update-function-code로 바로 배포한다(environments/bootstrap의
  # ci_deploy_lambda role, deploy-lambda.tf 참고). 그 배포가 이 필드들과 무관하게 먼저
  # 일어날 수 있으므로, 로컬에서 나중에 terraform apply를 돌려도 CI가 배포한 최신 코드를
  # 예전 로컬 dist/ 기준 zip으로 되돌리지 않도록 무시한다. 최초 생성 시점의 값은 그대로
  # 위 filename/source_code_hash가 쓰인다 - ignore_changes는 이후 apply에서만 적용된다.
  lifecycle {
    ignore_changes = [filename, source_code_hash]
  }

  # RDS/Redis/private EC2에 접근할 필요가 없는 Notification Lambda라 VPC에 연결하지 않는다.
  # VPC에 넣으면 Slack Webhook(공인 인터넷) 아웃바운드를 위해 NAT Gateway가 추가로 필요해지므로,
  # VPC 미연결이 곧 이 Lambda에는 비용/구성이 더 단순한 선택이다.
  environment {
    variables = {
      SLACK_WEBHOOK_PARAMETER_NAME = var.slack_webhook_parameter_name
      ALARM_NAME_PREFIX            = var.alarm_name_prefix

      # QuizSnapshotFailure(recovery_confirm_alarm_signal)의 RECOVERED 알림을 보내기 전,
      # GameStartSuccess 지표로 실제 게임 시작 성공이 recovery_confirm_min_count회 이상
      # 쌓였는지 확인하기 위한 설정 (src/get-recent-success-count.ts 참고).
      GAME_METRIC_NAMESPACE             = var.game_metric_namespace
      RECOVERY_CONFIRM_ALARM_SIGNAL     = var.recovery_confirm_alarm_signal
      RECOVERY_CONFIRM_METRIC_NAME      = var.recovery_confirm_metric_name
      RECOVERY_CONFIRM_MIN_COUNT        = tostring(var.recovery_confirm_min_count)
      RECOVERY_CONFIRM_LOOKBACK_MINUTES = tostring(var.recovery_confirm_lookback_minutes)
    }
  }

  depends_on = [aws_cloudwatch_log_group.alarm_notifier]

  tags = {
    Name        = local.function_name
    Environment = "prod"
    Service     = "notification"
  }
}
