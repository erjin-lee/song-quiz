# Game 구조화 로그(JSON, event 필드)에서 운영상 중요한 실패 이벤트만 CloudWatch Custom Metric으로
# 변환한다. requestId/roomId/userId/socketId 같이 값이 무한히 다양한 필드는 dimension으로 쓰지
# 않는다 - 그렇게 하면 metric이 사실상 무한히 늘어난다(high-cardinality). game Log Group 자체로
# 이미 서비스가 구분되므로 service/environment dimension도 추가하지 않는다.
#
# 요청받은 이벤트명 중 실제 apps/game 코드와 다른 것이 있어 실제 이벤트에 맞춰 pattern을 조정했다
# (자세한 배경은 작업 완료 보고 참고):
# - "game_start_failed"는 코드에 없다. 게임 시작(prepareFirstRound)이 apps/api에서 퀴즈 라운드
#   스냅샷을 못 받아왔을 때 남기는 실제 이벤트 "quiz_snapshot_failed"(room.service.ts)가 사실상
#   같은 실패 상황이라 이 이벤트를 QuizSnapshotFailure로 매핑했다.
# - "reconnect_failed"는 코드 어디에도 없다 - 재접속 성공만 event: 'reconnect_success'로 로깅되고,
#   실패 경로(참가자 없음/토큰 불일치)는 room:error만 emit할 뿐 로그 이벤트가 없다. 존재하지 않는
#   이벤트를 향한 filter는 의미가 없어 만들지 않았다(애플리케이션 로깅 추가는 이번 작업 범위 밖).
locals {
  game_failure_event_metrics = {
    redis_lock_failed    = "RedisLockFailure"
    timer_claim_failed   = "TimerClaimFailure"
    quiz_snapshot_failed = "QuizSnapshotFailure"
  }
}

resource "aws_cloudwatch_log_metric_filter" "game_failure_event" {
  for_each = local.game_failure_event_metrics

  name           = "${var.project_name}-game-${each.key}"
  log_group_name = aws_cloudwatch_log_group.game.name
  pattern        = "{ $.event = \"${each.key}\" }"

  metric_transformation {
    name          = each.value
    namespace     = var.game_metric_namespace
    value         = "1"
    default_value = "0"
    unit          = "Count"
  }
}

# QuizSnapshotFailure 알람이 OK로 전환됐을 때, alarm-notifier Lambda가 이 지표로 최근 게임
# 시작이 실제로 몇 번 성공했는지 확인한 뒤에만 RECOVERED를 Slack에 보낸다(단순히 실패가
# 한동안 없었다는 것만으로 복구를 단정하지 않기 위함). room.service.ts의 startGame/restartGame
# 둘 다 게임 시작 성공 시점에 event: 'game_started'를 남긴다(둘 다 내부적으로 같은
# prepareFirstRound를 호출하고, 실패 시에도 동일하게 quiz_snapshot_failed를 남기므로 성공
# 이벤트도 두 경로 모두에서 남겨야 짝이 맞는다). 실패 이벤트들과 성격이 달라(성공 카운트) 위
# for_each map에는 넣지 않고 별도 리소스로 둔다.
resource "aws_cloudwatch_log_metric_filter" "game_start_success" {
  name           = "${var.project_name}-game-game_started"
  log_group_name = aws_cloudwatch_log_group.game.name
  pattern        = "{ $.event = \"game_started\" }"

  metric_transformation {
    name          = "GameStartSuccess"
    namespace     = var.game_metric_namespace
    value         = "1"
    default_value = "0"
    unit          = "Count"
  }
}
