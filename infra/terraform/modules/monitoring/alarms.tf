# CloudWatch Alarm 1차 세트(총 8개) - "지금 서비스 장애 또는 장애 직전 상태인가"를 빠르게
# 감지하기 위한 최소 알람만 구성한다. 새 Metric/Metric Filter는 만들지 않고 dashboard.tf와
# 동일한 기존 지표만 사용한다. 이번 단계에서는 감지까지만 하고 SNS/EventBridge/Lambda 등
# alarm_actions는 연결하지 않는다(다음 Observability 단계에서 별도로 작업).
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
  alarm_description = "app_a average CPU utilization exceeded 95% over a 5-minute period (basic monitoring granularity, not a verified moment-to-moment 5-minute streak). service=ec2 severity=warning category=infrastructure signal=CPUUtilization condition=avg>95/5m"

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
  alarm_description = "app_a memory utilization exceeded 90% for 5 consecutive minutes. service=ec2 severity=warning category=infrastructure signal=mem_used_percent condition=avg>90/5m"

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
  alarm_description = "app_a root volume (path=/, fstype=${local.ec2_root_disk_fstype}) disk utilization reached or exceeded 95% for 5 consecutive minutes. service=ec2 severity=warning category=infrastructure signal=disk_used_percent condition=avg>=95/5m"

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
  alarm_description = "Game quiz snapshot failed at least once within 5 minutes. service=game severity=high category=application signal=QuizSnapshotFailure condition=sum>=1/5m"

  namespace   = var.game_metric_namespace
  metric_name = "QuizSnapshotFailure"
  statistic   = "Sum"

  period              = 300
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
