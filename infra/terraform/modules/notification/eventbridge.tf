# CloudWatch Alarm State Change 이벤트 전체를 다 받지 않고, EventBridge event pattern
# 단계에서 최대한 좁힌다:
# - state.value: ALARM/OK만(INSUFFICIENT_DATA 제외)
# - detail.alarmName: SongQuiz-Prod- prefix만("prefix matching"은 EventBridge content-based
#   filtering이 공식 지원하는 연산자라 - 복잡한 문자열 패턴을 억지로 만드는 게 아니다)
# 그래도 Lambda 쪽에서 alarmName prefix를 한 번 더 확인한다(handler.ts) - EventBridge 쪽
# 필터가 나중에 느슨해지거나 다른 Rule이 같은 Lambda를 대상으로 추가되는 실수에 대비한 방어선이다.
resource "aws_cloudwatch_event_rule" "alarm_state_change" {
  name        = "${var.name_prefix}-alarm-state-change"
  description = "${var.alarm_name_prefix}* CloudWatch Alarm의 ALARM/OK 상태 변화를 alarm-notifier Lambda로 전달한다"

  event_pattern = jsonencode({
    source      = ["aws.cloudwatch"]
    detail-type = ["CloudWatch Alarm State Change"]
    detail = {
      alarmName = [{ prefix = var.alarm_name_prefix }]
      state = {
        value = ["ALARM", "OK"]
      }
    }
  })
}

resource "aws_cloudwatch_event_target" "alarm_notifier" {
  rule = aws_cloudwatch_event_rule.alarm_state_change.name
  arn  = aws_lambda_function.alarm_notifier.arn
}

# EventBridge가 이 Lambda를 invoke할 수 있는 유일한 대상이 이 Rule이 되도록 source_arn으로 제한한다.
resource "aws_lambda_permission" "eventbridge_invoke" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.alarm_notifier.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.alarm_state_change.arn
}
