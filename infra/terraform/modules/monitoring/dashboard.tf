# 운영 중 "지금 장애 징후가 있는가? API/Game 중 어디가 문제인가? EC2/RDS/Redis 중 병목이
# 어디인가?"를 화면 하나에서 빠르게 답하기 위한 CloudWatch Dashboard. 새 Metric을 만들지
# 않고 이미 수집 중인 것만 시각화한다(ALB/RDS/ElastiCache는 AWS 기본 제공 지표, EC2 Memory/
# Disk와 Game 실패 이벤트는 이전 단계에서 만든 CloudWatch Agent/Metric Filter 결과물).
locals {
  period = 300 # 5분 - 이 Dashboard의 기본 period. 특별한 이유가 없는 한 모든 Widget이 공유한다.

  widgets = [
    # API/Game 트래픽 규모 비교
    {
      type   = "metric"
      x      = 0
      y      = 0
      width  = 12
      height = 6
      properties = {
        title  = "API/Game Traffic (RequestCount)"
        view   = "timeSeries"
        region = var.aws_region
        stat   = "Sum"
        period = local.period
        metrics = [
          ["AWS/ApplicationELB", "RequestCount", "LoadBalancer", var.alb_arn_suffix, "TargetGroup", var.api_target_group_arn_suffix, { label = "API" }],
          ["AWS/ApplicationELB", "RequestCount", "LoadBalancer", var.alb_arn_suffix, "TargetGroup", var.game_target_group_arn_suffix, { label = "Game" }],
        ]
      }
    },
    # API/Game latency를 한 그래프에서 비교
    {
      type   = "metric"
      x      = 12
      y      = 0
      width  = 12
      height = 6
      properties = {
        title  = "API/Game Latency (TargetResponseTime)"
        view   = "timeSeries"
        region = var.aws_region
        stat   = "Average"
        period = local.period
        metrics = [
          ["AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", var.alb_arn_suffix, "TargetGroup", var.api_target_group_arn_suffix, { label = "API" }],
          ["AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", var.alb_arn_suffix, "TargetGroup", var.game_target_group_arn_suffix, { label = "Game" }],
        ]
      }
    },
    # API/Game 중 어느 쪽이 장애인지 5xx로 범위를 좁힌다
    {
      type   = "metric"
      x      = 0
      y      = 6
      width  = 12
      height = 6
      properties = {
        title  = "API/Game 5xx (HTTPCode_Target_5XX_Count)"
        view   = "timeSeries"
        region = var.aws_region
        stat   = "Sum"
        period = local.period
        metrics = [
          ["AWS/ApplicationELB", "HTTPCode_Target_5XX_Count", "LoadBalancer", var.alb_arn_suffix, "TargetGroup", var.api_target_group_arn_suffix, { label = "API" }],
          ["AWS/ApplicationELB", "HTTPCode_Target_5XX_Count", "LoadBalancer", var.alb_arn_suffix, "TargetGroup", var.game_target_group_arn_suffix, { label = "Game" }],
        ]
      }
    },
    # Game 내부 실패 이벤트 3종(Metric Filter 결과) - 전부 dimension 없는 카운터라 값만 나열
    {
      type   = "metric"
      x      = 12
      y      = 6
      width  = 12
      height = 6
      properties = {
        title  = "Game Failures"
        view   = "timeSeries"
        region = var.aws_region
        stat   = "Sum"
        period = local.period
        metrics = [
          [var.game_metric_namespace, "QuizSnapshotFailure"],
          [var.game_metric_namespace, "RedisLockFailure"],
          [var.game_metric_namespace, "TimerClaimFailure"],
        ]
      }
    },
    # EC2 자원 부족 여부 - CPU(AWS/EC2)와 Memory/Disk(CloudWatch Agent, SongQuiz/EC2)를 한 화면에
    {
      type   = "metric"
      x      = 0
      y      = 12
      width  = 12
      height = 6
      properties = {
        title  = "EC2 Resources (app_a)"
        view   = "timeSeries"
        region = var.aws_region
        stat   = "Average"
        period = local.period
        yAxis = {
          left = { min = 0, max = 100 }
        }
        metrics = [
          ["AWS/EC2", "CPUUtilization", "InstanceId", var.app_instance_id, { label = "CPUUtilization" }],
          [var.ec2_metric_namespace, "mem_used_percent", "InstanceId", var.app_instance_id, { label = "mem_used_percent" }],
          # disk_used_percent는 InstanceId 외에 CloudWatch Agent가 자동으로 붙이는 fstype
          # dimension도 갖고 있는데, 그 값(ext4 등)을 Terraform이 알 방법이 없어 하드코딩하지
          # 않는다. path="/"(우리가 수집하도록 설정한 유일한 mount point)로만 필터링하는
          # SEARCH 식을 써서 실제 fstype 값과 무관하게 정확히 이 지표 하나만 찾는다.
          [{
            expression = "SEARCH('{${var.ec2_metric_namespace},InstanceId,fstype,path} MetricName=\"disk_used_percent\" InstanceId=\"${var.app_instance_id}\" path=\"/\"', 'Average', ${local.period})"
            label      = "disk_used_percent (path=/)"
            id         = "diskUsedPercent"
          }],
        ]
      }
    },
    # RDS가 병목인지 - CPU
    {
      type   = "metric"
      x      = 12
      y      = 12
      width  = 12
      height = 6
      properties = {
        title  = "RDS CPU"
        view   = "timeSeries"
        region = var.aws_region
        stat   = "Average"
        period = local.period
        metrics = [
          ["AWS/RDS", "CPUUtilization", "DBInstanceIdentifier", var.db_instance_identifier],
        ]
      }
    },
    # RDS가 병목인지 - Connection pool 급증 여부는 평균보다 최댓값이 중요
    {
      type   = "metric"
      x      = 0
      y      = 18
      width  = 12
      height = 6
      properties = {
        title  = "RDS Connections"
        view   = "timeSeries"
        region = var.aws_region
        stat   = "Maximum"
        period = local.period
        metrics = [
          ["AWS/RDS", "DatabaseConnections", "DBInstanceIdentifier", var.db_instance_identifier],
        ]
      }
    },
    # Redis가 문제인지 - 메모리 사용률(%)은 왼쪽 축, 연결 수/축출 횟수는 스케일이 달라 오른쪽 축.
    # Evictions는 발생 횟수라 Sum, 나머지 둘은 시점 값이라 Average를 쓴다.
    {
      type   = "metric"
      x      = 12
      y      = 18
      width  = 12
      height = 6
      properties = {
        title  = "Redis"
        view   = "timeSeries"
        region = var.aws_region
        period = local.period
        metrics = [
          ["AWS/ElastiCache", "DatabaseMemoryUsagePercentage", "CacheClusterId", var.cache_cluster_id, { stat = "Average", label = "Memory Usage %" }],
          ["AWS/ElastiCache", "CurrConnections", "CacheClusterId", var.cache_cluster_id, { stat = "Average", label = "Current Connections", yAxis = "right" }],
          ["AWS/ElastiCache", "Evictions", "CacheClusterId", var.cache_cluster_id, { stat = "Sum", label = "Evictions", yAxis = "right" }],
        ]
      }
    },
  ]
}

resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = var.dashboard_name
  dashboard_body = jsonencode({
    widgets = local.widgets
  })
}
