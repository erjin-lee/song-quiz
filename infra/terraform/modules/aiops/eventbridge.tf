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
# v1-2에서 Game Target5xx ALARM을, v1-3에서 API Target5xx ALARM을 추가했다 - 리소스
# 주소(aws_cloudwatch_event_rule.quiz_snapshot_failure_alarm)는 그대로 두고 event_pattern의
# alarmName 목록만 늘렸다(리소스 이름을 바꾸면 Terraform이 삭제 후 재생성으로 계획해
# 불필요한 replace가 생긴다).
#
# 3단계(ECS Fargate 이관)에서 api_ecs_target_5xx_alarm_name을 추가했다 - API Target5xx는
# 이제 EC2 app 타겟그룹과 ECS app_ecs 타겟그룹 두 곳 모두에 Alarm이 있고(monitoring 모듈의
# local.alarm_target_groups), api_traffic_target 값에 따라 실제로 어느 쪽이 ALARM이 될지
# 달라진다. 두 Alarm 모두 여기서 감시해야 트래픽 전환 시점과 무관하게 분석이 끊기지
# 않는다(incident-policy.ts의 IncidentPolicy.additionalAlarms가 Lambda 쪽에서 두 이름을
# 같은 API_TARGET_5XX IncidentType으로 취급한다).
#
# ECS Fargate 이관 4단계 AIOps 보정에서 game_ecs_target_5xx_alarm_name을 동일한 이유로
# 추가했다 - Game도 game_traffic_target 값에 따라 EC2 game 타겟그룹/ECS game_ecs 타겟그룹
# 중 어느 쪽이 실제로 ALARM이 될지 달라진다.
resource "aws_cloudwatch_event_rule" "quiz_snapshot_failure_alarm" {
  name        = "${var.name_prefix}-aiops-quiz-snapshot-failure"
  description = "${var.quiz_snapshot_failure_alarm_name}/${var.game_target_5xx_alarm_name}/${var.game_ecs_target_5xx_alarm_name}/${var.api_target_5xx_alarm_name}/${var.api_ecs_target_5xx_alarm_name} Alarm의 ALARM 상태 변화만 incident-analyzer Lambda로 전달한다"

  event_pattern = jsonencode({
    source      = ["aws.cloudwatch"]
    detail-type = ["CloudWatch Alarm State Change"]
    detail = {
      alarmName = [
        var.quiz_snapshot_failure_alarm_name,
        var.game_target_5xx_alarm_name,
        var.game_ecs_target_5xx_alarm_name,
        var.api_target_5xx_alarm_name,
        var.api_ecs_target_5xx_alarm_name,
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
