# CloudWatch Alarm - "지금 서비스 장애 또는 장애 직전 상태인가"를 빠르게 감지하기 위한
# 최소 알람만 구성한다.
#
# 1차 세트(총 8개, 2026-08-24): 새 Metric/Metric Filter는 만들지 않고 dashboard.tf와 동일한
# 기존 지표만 사용했다. 이 단계에서는 감지까지만 하고 alarm_actions는 연결하지 않았다.
# 2026-08-26 추가(총 10개): Room 분산 락 붕괴 감지 2개(맨 아래). 이 둘은 같은 PR에서 함께
# 추가한 Metric Filter(modules/logging/metric-filters.tf)의 지표를 쓴다.
#
# alarm_actions는 여전히 어느 Alarm에도 붙이지 않는다 - 이후 추가된 notification 모듈이
# SNS 대신 EventBridge Rule에서 "SongQuiz-Prod-" prefix로 매칭해 alarm-notifier Lambda(Slack)로
# 보내기 때문이다. 즉 아래 naming convention을 지키는 것만으로 Slack 알림까지 연결된다.
#
# Naming convention: SongQuiz-Prod-{Severity}-{Service}-{Signal}
#   Severity: Critical(가용성 직접 영향) / High(핵심 기능 실패·실제 오류) / Warning(장애 가능성 높은 자원 상태)
# 같은 Metric에 여러 Severity의 Alarm을 중복 생성하지 않는다.
#
# treat_missing_data는 전부 notBreaching으로 통일한다 - 이 8개 Metric 모두 정상 상태에서
# datapoint 자체가 없거나(5xx, QuizSnapshotFailure) 드물게 수집이 밀리는 상황을 장애로
# 오판하면 안 되기 때문이다.

# API/Game 타겟그룹은 조건은 동일하고 대상(TargetGroup dimension)만 다르므로 for_each로 묶는다.
# label은 Alarm 이름에 쓰는 표기(API/Game), each.key는 태그에 쓰는 값(api/game)이다.
locals {
  alarm_target_groups = {
    api = {
      label                   = "API"
      target_group_arn_suffix = var.api_target_group_arn_suffix
    }
    game = {
      label                   = "Game"
      target_group_arn_suffix = var.game_target_group_arn_suffix
    }
    # ECS Fargate 이관 2단계 - api_traffic_target이 아직 "ec2"(기본값)라 app_ecs
    # 타겟그룹에는 weight 0으로 트래픽이 거의 없을 수 있지만, 컷오버 전에 미리
    # UnhealthyHost/Target5xx 알람을 만들어둬야 실제로 "ecs"로 전환한 뒤에도 공백 없이
    # 관측된다(전환 시점에 알람을 뒤늦게 추가하면 그 사이가 무방비 상태가 된다).
    api_ecs = {
      label                   = "API-ECS"
      target_group_arn_suffix = var.api_ecs_target_group_arn_suffix
    }
    # ECS Fargate 이관 4단계 - api_ecs와 동일한 이유로, game_traffic_target이 아직
    # "ec2"(기본값)인 동안에도 UnhealthyHost/Target5xx 알람을 미리 만들어둔다.
    game_ecs = {
      label                   = "Game-ECS"
      target_group_arn_suffix = var.game_ecs_target_group_arn_suffix
    }
  }
}

# --- Availability: UnHealthyHostCount (Critical) ---
# ALB가 해당 서비스의 Target을 unhealthy로 판단 중이라는 뜻이라 가용성 장애 신호로 취급한다.
resource "aws_cloudwatch_metric_alarm" "unhealthy_host_count" {
  for_each = local.alarm_target_groups

  alarm_name        = "SongQuiz-Prod-Critical-${each.value.label}-UnhealthyHost"
  alarm_description = "${each.value.label} target group has had at least 1 unhealthy host for 2 consecutive minutes. service=${each.key} severity=critical category=availability signal=UnHealthyHostCount condition=max>=1/2m"

  namespace   = "AWS/ApplicationELB"
  metric_name = "UnHealthyHostCount"
  statistic   = "Maximum"
  dimensions = {
    LoadBalancer = var.alb_arn_suffix
    TargetGroup  = each.value.target_group_arn_suffix
  }

  period              = 60
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"

  tags = {
    Environment = "prod"
    Service     = each.key
    Severity    = "critical"
    Category    = "availability"
  }
}

# --- Availability: API-ECS No Healthy Hosts (Critical) ---
# ECS Fargate 이관 2단계 - 이미지 pull 실패, SSM/KMS 권한 누락, 앱 부팅 실패 등으로
# 태스크가 하나도 뜨지 못하면(0개) UnHealthyHostCount/Target5xx 둘 다 조용하다 -
# 대상이 아예 없으면 "unhealthy"할 대상도, "5xx를 반환한" 대상도 없기 때문이다(이 경우
# ALB 자신이 반환하는 503은 HTTPCode_ELB_5XX_Count로 집계되고 위 target_5xx가 보는
# HTTPCode_Target_5XX_Count에는 잡히지 않는다). 그래서 UnHealthyHostCount만으로는 완전
# 장애를 놓칠 수 있어, HealthyHostCount가 최소 1 미만으로 떨어지는지 별도로 본다.
# treat_missing_data를 다른 알람들과 달리 "breaching"으로 두는 이유: 이 지표가 없다는
# 것 자체가(등록된 target이 전혀 없다는 뜻이라) "healthy host가 없다"와 사실상 같은
# 신호이기 때문이다 - 다른 알람들의 notBreaching(트래픽 부재를 장애로 오판하지 않으려는
# 목적)과는 정반대 상황이다.
resource "aws_cloudwatch_metric_alarm" "api_ecs_no_healthy_hosts" {
  alarm_name        = "SongQuiz-Prod-Critical-API-ECS-NoHealthyHosts"
  alarm_description = "apps/api ECS target group has had zero healthy hosts for 3 consecutive minutes - likely a total outage (image pull/SSM/KMS/boot failure) that UnhealthyHost/Target5xx alone would miss. service=api_ecs severity=critical category=availability signal=HealthyHostCount condition=min<1/3m(breaching on missing data)"

  namespace   = "AWS/ApplicationELB"
  metric_name = "HealthyHostCount"
  statistic   = "Minimum"
  dimensions = {
    LoadBalancer = var.alb_arn_suffix
    TargetGroup  = var.api_ecs_target_group_arn_suffix
  }

  period              = 60
  evaluation_periods  = 3
  datapoints_to_alarm = 3
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"

  tags = {
    Environment = "prod"
    Service     = "api_ecs"
    Severity    = "critical"
    Category    = "availability"
  }
}

# --- Availability: Game-ECS No Healthy Hosts (Critical) ---
# api_ecs_no_healthy_hosts(위)와 동일한 이유 - ECS Fargate 이관 4단계.
resource "aws_cloudwatch_metric_alarm" "game_ecs_no_healthy_hosts" {
  alarm_name        = "SongQuiz-Prod-Critical-Game-ECS-NoHealthyHosts"
  alarm_description = "apps/game ECS target group has had zero healthy hosts for 3 consecutive minutes - likely a total outage (image pull/SSM/KMS/boot failure) that UnhealthyHost/Target5xx alone would miss. service=game_ecs severity=critical category=availability signal=HealthyHostCount condition=min<1/3m(breaching on missing data)"

  namespace   = "AWS/ApplicationELB"
  metric_name = "HealthyHostCount"
  statistic   = "Minimum"
  dimensions = {
    LoadBalancer = var.alb_arn_suffix
    TargetGroup  = var.game_ecs_target_group_arn_suffix
  }

  period              = 60
  evaluation_periods  = 3
  datapoints_to_alarm = 3
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"

  tags = {
    Environment = "prod"
    Service     = "game_ecs"
    Severity    = "critical"
    Category    = "availability"
  }
}

# --- Availability: Target 5xx (High) ---
# 초기 threshold(5분 5건)는 운영값이며 실제 traffic/error baseline을 관찰한 뒤 조정한다.
resource "aws_cloudwatch_metric_alarm" "target_5xx" {
  for_each = local.alarm_target_groups

  alarm_name        = "SongQuiz-Prod-High-${each.value.label}-Target5xx"
  alarm_description = "${each.value.label} target group returned at least 5 5xx responses within 5 minutes (initial threshold, to be tuned against real traffic baseline). service=${each.key} severity=high category=availability signal=HTTPCode_Target_5XX_Count condition=sum>=5/5m"

  namespace   = "AWS/ApplicationELB"
  metric_name = "HTTPCode_Target_5XX_Count"
  statistic   = "Sum"
  dimensions = {
    LoadBalancer = var.alb_arn_suffix
    TargetGroup  = each.value.target_group_arn_suffix
  }

  period              = 300
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  threshold           = 5
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"

  tags = {
    Environment = "prod"
    Service     = each.key
    Severity    = "high"
    Category    = "availability"
  }
}

# --- Infrastructure: EC2 High CPU (Warning) ---
# app_a는 Detailed Monitoring이 꺼져 있다(compute 모듈에 monitoring=true 없음). 이번 작업에서
# 비용/동작 변화가 있는 Detailed Monitoring을 임의로 켜지 않으므로, 기본 5분 granularity로만
# 구성한다. 따라서 이 Alarm은 "매 순간 CPU가 95%를 넘는 상태가 5분간 유지"가 아니라
# "5분 집계 구간의 평균 CPU가 95%를 초과"를 의미한다.
resource "aws_cloudwatch_metric_alarm" "ec2_high_cpu" {
  alarm_name        = "SongQuiz-Prod-Warning-EC2-HighCPU"
  alarm_description = "app_a average CPU utilization exceeded 95% over a 5-minute period (basic monitoring granularity, not a verified moment-to-moment 5-minute streak). API moved to ECS Fargate in stage 2, so this EC2 metric now reflects the Game process only. service=ec2 severity=warning category=infrastructure signal=CPUUtilization condition=avg>95/5m"

  namespace   = "AWS/EC2"
  metric_name = "CPUUtilization"
  statistic   = "Average"
  dimensions = {
    InstanceId = var.app_instance_id
  }

  period              = 300
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  threshold           = 95
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  tags = {
    Environment = "prod"
    Service     = "ec2"
    Severity    = "warning"
    Category    = "infrastructure"
  }
}

# --- Infrastructure: EC2 High Memory (Warning) ---
# CloudWatch Agent가 60초마다 SongQuiz/EC2 namespace로 발행하므로(Detailed Monitoring과 무관),
# 1분 datapoint 5개 연속으로 실제 5분 지속을 그대로 표현할 수 있다.
resource "aws_cloudwatch_metric_alarm" "ec2_high_memory" {
  alarm_name        = "SongQuiz-Prod-Warning-EC2-HighMemory"
  alarm_description = "app_a memory utilization exceeded 90% for 5 consecutive minutes. API moved to ECS Fargate in stage 2, so this EC2 metric now reflects the Game process only. service=ec2 severity=warning category=infrastructure signal=mem_used_percent condition=avg>90/5m"

  namespace   = var.ec2_metric_namespace
  metric_name = "mem_used_percent"
  statistic   = "Average"
  dimensions = {
    InstanceId = var.app_instance_id
  }

  period              = 60
  evaluation_periods  = 5
  datapoints_to_alarm = 5
  threshold           = 90
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  tags = {
    Environment = "prod"
    Service     = "ec2"
    Severity    = "warning"
    Category    = "infrastructure"
  }
}

# --- Infrastructure: ECS API High CPU (Warning) ---
# ECS Fargate 이관 2단계 - AWS/ECS 서비스 CPU/MemoryUtilization은 Container Insights
# 없이도 기본 제공되는 지표라 추가 비용 없이 바로 쓸 수 있다. RunningTaskCount 등
# 태스크 개수 기반 지표는 Container Insights가 있어야 하므로(비용 발생) 이번 단계에서는
# 도입하지 않는다 - 3단계(관측 안정화)에서 필요성을 다시 판단한다.
resource "aws_cloudwatch_metric_alarm" "ecs_api_high_cpu" {
  alarm_name        = "SongQuiz-Prod-Warning-API-ECS-HighCPU"
  alarm_description = "apps/api ECS service average CPU utilization exceeded 90% over a 5-minute period. service=api_ecs severity=warning category=infrastructure signal=CPUUtilization condition=avg>90/5m"

  namespace   = "AWS/ECS"
  metric_name = "CPUUtilization"
  statistic   = "Average"
  dimensions = {
    ClusterName = var.ecs_cluster_name
    ServiceName = var.ecs_api_service_name
  }

  period              = 300
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  threshold           = 90
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  tags = {
    Environment = "prod"
    Service     = "api_ecs"
    Severity    = "warning"
    Category    = "infrastructure"
  }
}

# --- Infrastructure: ECS API High Memory (Warning) ---
resource "aws_cloudwatch_metric_alarm" "ecs_api_high_memory" {
  alarm_name        = "SongQuiz-Prod-Warning-API-ECS-HighMemory"
  alarm_description = "apps/api ECS service average memory utilization exceeded 90% over a 5-minute period. service=api_ecs severity=warning category=infrastructure signal=MemoryUtilization condition=avg>90/5m"

  namespace   = "AWS/ECS"
  metric_name = "MemoryUtilization"
  statistic   = "Average"
  dimensions = {
    ClusterName = var.ecs_cluster_name
    ServiceName = var.ecs_api_service_name
  }

  period              = 300
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  threshold           = 90
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  tags = {
    Environment = "prod"
    Service     = "api_ecs"
    Severity    = "warning"
    Category    = "infrastructure"
  }
}

# --- Infrastructure: ECS Game High CPU (Warning) ---
# ecs_api_high_cpu(위)와 동일한 이유 - ECS Fargate 이관 4단계.
resource "aws_cloudwatch_metric_alarm" "ecs_game_high_cpu" {
  alarm_name        = "SongQuiz-Prod-Warning-Game-ECS-HighCPU"
  alarm_description = "apps/game ECS service average CPU utilization exceeded 90% over a 5-minute period. service=game_ecs severity=warning category=infrastructure signal=CPUUtilization condition=avg>90/5m"

  namespace   = "AWS/ECS"
  metric_name = "CPUUtilization"
  statistic   = "Average"
  dimensions = {
    ClusterName = var.ecs_cluster_name
    ServiceName = var.ecs_game_service_name
  }

  period              = 300
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  threshold           = 90
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  tags = {
    Environment = "prod"
    Service     = "game_ecs"
    Severity    = "warning"
    Category    = "infrastructure"
  }
}

# --- Infrastructure: ECS Game High Memory (Warning) ---
resource "aws_cloudwatch_metric_alarm" "ecs_game_high_memory" {
  alarm_name        = "SongQuiz-Prod-Warning-Game-ECS-HighMemory"
  alarm_description = "apps/game ECS service average memory utilization exceeded 90% over a 5-minute period. service=game_ecs severity=warning category=infrastructure signal=MemoryUtilization condition=avg>90/5m"

  namespace   = "AWS/ECS"
  metric_name = "MemoryUtilization"
  statistic   = "Average"
  dimensions = {
    ClusterName = var.ecs_cluster_name
    ServiceName = var.ecs_game_service_name
  }

  period              = 300
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  threshold           = 90
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  tags = {
    Environment = "prod"
    Service     = "game_ecs"
    Severity    = "warning"
    Category    = "infrastructure"
  }
}

# disk_used_percent는 InstanceId 외에 CloudWatch Agent가 자동으로 붙이는 fstype dimension도
# 갖는데(amazon-cloudwatch-agent.json에 fstype을 지정하는 곳이 없고, drop_device=true는 device
# dimension만 제거할 뿐), Terraform 코드만으로는 그 값을 알 수 없어 추측하지 않는다. app_a
# 인스턴스(i-088da98215dd782e4)에서 `findmnt -n -o FSTYPE /`로 실측한 값이며, app_a의 루트
# 볼륨/AMI가 바뀌면(인스턴스 재생성, 파일시스템 재포맷 등) 함께 재확인해서 갱신해야 한다.
locals {
  ec2_root_disk_fstype = "ext4"
}

# --- Infrastructure: EC2 High Disk (Warning) ---
# threshold는 CPU와 달리 "95% 이상"(경계값 포함)으로 지정받아 GreaterThanOrEqualToThreshold를
# 쓴다 - 알람 생성 시점 실측 사용률이 이미 91%였고, 원래 검토했던 85% 기준을 그대로 쓰면
# 배포 직후부터 계속 ALARM 상태가 되므로 95%로 올렸다.
resource "aws_cloudwatch_metric_alarm" "ec2_high_disk" {
  alarm_name        = "SongQuiz-Prod-Warning-EC2-HighDisk"
  alarm_description = "app_a root volume (path=/, fstype=${local.ec2_root_disk_fstype}) disk utilization reached or exceeded 95% for 5 consecutive minutes. Disk is still shared by both processes even after the API moved to ECS Fargate in stage 2 (only CPU/Memory became Game-only). service=ec2 severity=warning category=infrastructure signal=disk_used_percent condition=avg>=95/5m"

  namespace   = var.ec2_metric_namespace
  metric_name = "disk_used_percent"
  statistic   = "Average"
  dimensions = {
    InstanceId = var.app_instance_id
    path       = "/"
    fstype     = local.ec2_root_disk_fstype
  }

  period              = 60
  evaluation_periods  = 5
  datapoints_to_alarm = 5
  threshold           = 95
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"

  tags = {
    Environment = "prod"
    Service     = "ec2"
    Severity    = "warning"
    Category    = "infrastructure"
  }
}

# --- Application: QuizSnapshotFailure (High) ---
# 게임 시작 과정에서 Quiz Snapshot 조회가 실패한 것은 핵심 기능 실패로 판단한다.
# 초기 threshold(>=1)는 false positive가 많으면 추후 >=2, >=3 등으로 조정한다.
resource "aws_cloudwatch_metric_alarm" "quiz_snapshot_failure" {
  alarm_name        = "SongQuiz-Prod-High-Game-QuizSnapshotFailure"
  alarm_description = "Game quiz snapshot failed at least once within 1 minute. service=game severity=high category=application signal=QuizSnapshotFailure condition=sum>=1/1m"

  namespace   = var.game_metric_namespace
  metric_name = "QuizSnapshotFailure"
  statistic   = "Sum"

  period              = 60
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"

  tags = {
    Environment = "prod"
    Service     = "game"
    Severity    = "high"
    Category    = "application"
  }
}

# --- Application: Room 분산 락 붕괴 감지 (High) ---
# 아래 두 Alarm은 "room 분산 락의 상호배제가 실제로 깨졌다"는 신호다. 배경은
# docs/adr/0001-room-realtime-state-and-reconnect.md의 "Redis 장애 내성 보강" 참고.
#
# 두 지표를 하나로 합치지 않고 각각 Alarm을 두는 이유: 서로 다른 시점을 가리키고, 한쪽 없이
# 다른 쪽만 발생할 수 있다. lease 상실은 "내가 락을 잃었다고 스스로 판정한" 시점이고, fencing
# 거부는 "실제로 다른 워커와 충돌해 쓰기가 막힌" 시점이다. 락 key가 사라지고 다른 워커가 새로
# 잡은 뒤 원래 워커의 다음 하트비트(최대 4초)가 오기 전에 쓰기를 시도하면, 그 워커는 아직 자기
# lease가 유효하다고 믿으므로 lease 상실 없이 fencing 거부만 발생한다. 합쳐두면 Slack 알림에서
# 이 둘을 구분할 수 없어 원인 파악이 느려진다.
#
# Severity를 high로 두는 이유: 가용성이 직접 죽은 것은 아니라 critical은 아니지만, 두 경우 모두
# 실제 오류이고(요청이 503으로 실패한다) 근본 원인(Redis 장애 또는 락 로직 결함)은 즉시 조사가
# 필요하다. threshold >= 1은 QuizSnapshotFailure와 같은 기준이다 - 정상 운영에서는 datapoint
# 자체가 없어야 하는 이벤트라, 1건이라도 나오면 봐야 한다.
#
# 이 Alarm들은 alarm_actions를 붙이지 않는다. notification 모듈의 EventBridge Rule이
# "SongQuiz-Prod-" prefix로 매칭하므로 이름만 규칙에 맞으면 자동으로 Slack까지 전달된다.
# aiops 모듈(incident-analyzer)의 Rule은 alarmName을 명시적으로 나열하므로, 이 두 Alarm은
# AI 분석 대상이 아니다(OpenAI 호출 비용이 늘지 않는다).
resource "aws_cloudwatch_metric_alarm" "room_lock_lease_lost" {
  alarm_name        = "SongQuiz-Prod-High-Game-RoomLockLeaseLost"
  alarm_description = "Game room distributed lock lease was lost at least once within 1 minute, meaning mutual exclusion was no longer guaranteed for that critical section. service=game severity=high category=application signal=RoomLockLeaseLost condition=sum>=1/1m"

  namespace   = var.game_metric_namespace
  metric_name = "RoomLockLeaseLost"
  statistic   = "Sum"

  period              = 60
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"

  tags = {
    Environment = "prod"
    Service     = "game"
    Severity    = "high"
    Category    = "application"
  }
}

resource "aws_cloudwatch_metric_alarm" "stale_fencing_write_rejected" {
  alarm_name        = "SongQuiz-Prod-High-Game-StaleFencingWriteRejected"
  alarm_description = "Game room state write/delete was rejected at least once within 1 minute because a newer fencing token had already been issued, meaning two workers held the same room lock concurrently. service=game severity=high category=application signal=StaleFencingWriteRejected condition=sum>=1/1m"

  namespace   = var.game_metric_namespace
  metric_name = "StaleFencingWriteRejected"
  statistic   = "Sum"

  period              = 60
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"

  tags = {
    Environment = "prod"
    Service     = "game"
    Severity    = "high"
    Category    = "application"
  }
}
