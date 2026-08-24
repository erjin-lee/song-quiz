# modules/notification의 EventBridge Rule(SongQuiz-Prod-* 전체, ALARM/OK 둘 다)에 target만
# 추가하지 않고, 이 모듈에 별도 Rule을 둔다(§2, §36) - 이유:
#   1. notification은 "즉시 알림"(모든 SongQuiz-Prod-* Alarm), aiops는 "지원하는 Alarm만
#      심층 분석"으로 책임 범위가 다르다. notification 모듈의 event_pattern을 건드리지
#      않아 기존 alarm-notifier 동작에 영향이 전혀 없다(§2 요구사항을 Terraform 리소스
#      수준에서도 분리해 지킨다).
#   2. event pattern 단계에서 alarmName을 이 Lambda가 실제로 분석하는 Alarm들로, state도
#      ALARM으로만 좁혀서, 관련 없는 다른 Alarm이나 OK 상태 전이마다 이 Lambda가 불필요하게
#      invoke되지 않는다(§5, §6, §32 비용 제한) - Lambda 쪽 방어적 재검증(handler.ts)은
#      유지하되 1차 필터링을 EventBridge에서 최대한 정확하게 한다.
#   3. 향후 다른 Alarm까지 AI 분석을 확장하더라도 notification 모듈은 전혀 손대지 않고
#      이 Rule의 alarmName 목록과 Lambda 환경변수만 추가하면 된다.
#
# v1-2에서 Game Target5xx ALARM을 추가했다 - 리소스 주소(aws_cloudwatch_event_rule.
# quiz_snapshot_failure_alarm)는 그대로 두고 event_pattern의 alarmName 목록만 늘렸다
# (리소스 이름을 바꾸면 Terraform이 삭제 후 재생성으로 계획해 불필요한 replace가 생긴다).
resource "aws_cloudwatch_event_rule" "quiz_snapshot_failure_alarm" {
  name        = "${var.name_prefix}-aiops-quiz-snapshot-failure"
  description = "${var.quiz_snapshot_failure_alarm_name}/${var.game_target_5xx_alarm_name} Alarm의 ALARM 상태 변화만 incident-analyzer Lambda로 전달한다"

  event_pattern = jsonencode({
    source      = ["aws.cloudwatch"]
    detail-type = ["CloudWatch Alarm State Change"]
    detail = {
      alarmName = [
        var.quiz_snapshot_failure_alarm_name,
        var.game_target_5xx_alarm_name,
      ]
      state = {
        value = ["ALARM"]
      }
    }
  })
}

resource "aws_cloudwatch_event_target" "incident_analyzer" {
  rule = aws_cloudwatch_event_rule.quiz_snapshot_failure_alarm.name
  arn  = aws_lambda_function.incident_analyzer.arn
}

resource "aws_lambda_permission" "eventbridge_invoke" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.incident_analyzer.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.quiz_snapshot_failure_alarm.arn
}
