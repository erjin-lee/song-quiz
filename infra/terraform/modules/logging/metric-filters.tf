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
#
# 2026-08-26: room 분산 락의 Redis 장애 내성 보강(ADR-0001 "Redis 장애 내성 보강")으로 생긴
# 이벤트 3종을 추가했다. for_each map에 key를 "추가"만 하므로 기존 3개 filter는 그대로 유지된다
# (map key가 리소스 주소라, 기존 key의 이름이나 순서를 바꾸면 삭제 후 재생성이 된다).
#
# redis_lock_failed는 이름을 바꾸지 않았다 - 이 이름으로 만들어지는 RedisLockFailure 지표를
# monitoring 모듈의 Dashboard가 이미 참조하고 있어서, 이벤트명을 바꾸면 위젯이 조용히 0이 된다.
# 애플리케이션 쪽은 대신 errorCode(LOCK_BUSY / REDIS_UNAVAILABLE / LOCK_ACQUIRE_TIMEOUT)로
# 실패 원인을 구분한다.
locals {
  game_failure_event_metrics = {
    redis_lock_failed    = "RedisLockFailure"
    timer_claim_failed   = "TimerClaimFailure"
    quiz_snapshot_failed = "QuizSnapshotFailure"

    # 하트비트(PEXPIRE) 1회 실패. 이것만으로는 락을 잃은 것이 아니다 - lease 만료 시각
    # 전에 재시도가 성공하면 정상 회복된다. 그래서 Alarm은 걸지 않고 Dashboard 추이로만
    # 본다(Redis 연결 품질의 선행 지표). 알람을 걸려면 "몇 분간 몇 회 이상"이 필요한데,
    # 실제 baseline을 관찰하기 전에 threshold를 찍으면 오탐만 만든다.
    redis_lock_renew_failed = "RedisLockRenewFailure"

    # lease 만료를 실제로 판정한 시점. 이 시점부터 그 워커는 상호배제를 보장받지 못한다.
    room_lock_lease_lost = "RoomLockLeaseLost"

    # 더 새로운 fencing token이 이미 발급돼 Redis가 쓰기/삭제를 거부한 시점. 방어가
    # 작동한 것이지만, 발생했다는 것 자체가 "두 워커가 같은 방을 동시에 잡고 있었다"는
    # 사실을 의미한다. room_lock_lease_lost 없이도 발생할 수 있다 - 락 key가 사라지고
    # 다른 워커가 새로 잡은 뒤, 원래 워커의 다음 하트비트(최대 4초)가 오기 전에 쓰기를
    # 시도하면 그 워커는 아직 자기 lease가 유효하다고 믿는 상태이기 때문이다.
    stale_fencing_write_rejected = "StaleFencingWriteRejected"
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
