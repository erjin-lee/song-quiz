# notification/aiops 모듈은 "이벤트(Alarm 상태 변화)에 반응"하는 Lambda라 EventBridge Rule +
# event_pattern을 쓰지만, 이 Lambda는 "하루 한 번 정해진 시각에" 실행되어야 하므로 그 컨벤션을
# 그대로 재사용할 수 없다. cron 기반 트리거에는 EventBridge Rule(schedule_expression)도 있지만,
# EventBridge Scheduler가 더 최신 서비스이고 timezone을 네이티브로 지원해(schedule_expression_timezone)
# UTC로 수동 변환한 cron을 쓰지 않아도 된다(§6) - 그래서 이 프로젝트에 새로 등장하는
# aws_scheduler_schedule을 선택했다.
#
# EventBridge Scheduler는 EventBridge Rule과 달리 대상을 "이 Role로 직접 invoke"하는 방식이라
# (aws_lambda_permission으로 event source를 허용하는 대신) 아래 IAM Role이 필요하다.
resource "aws_iam_role" "cost_reporter_scheduler" {
  name = "${local.function_name}-scheduler"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "scheduler.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = {
    Name = "${local.function_name}-scheduler"
  }
}

# 이 Lambda 함수 하나만 호출할 수 있도록 Resource를 정확히 이 함수 ARN으로 좁힌다.
resource "aws_iam_role_policy" "cost_reporter_scheduler_invoke" {
  name = "${local.function_name}-scheduler-invoke"
  role = aws_iam_role.cost_reporter_scheduler.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "lambda:InvokeFunction"
        Resource = aws_lambda_function.cost_reporter.arn
      }
    ]
  })
}

resource "aws_scheduler_schedule" "cost_reporter_daily" {
  name = "${local.function_name}-daily"

  # 유연한 실행 시각 창을 두지 않고 정확히 schedule_expression 시각에 실행한다 - 이 Lambda는
  # 동시에 여러 개가 몰려서 실행돼도 문제될 정도로 무겁지 않고(§4), 오히려 "전일 비용" 조회
  # 기준 시각이 흔들리지 않는 편이 낫다.
  flexible_time_window {
    mode = "OFF"
  }

  schedule_expression          = var.schedule_expression
  schedule_expression_timezone = var.schedule_expression_timezone

  target {
    arn      = aws_lambda_function.cost_reporter.arn
    role_arn = aws_iam_role.cost_reporter_scheduler.arn
  }
}
