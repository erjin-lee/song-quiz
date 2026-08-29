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
    # Game 내부 실패 이벤트 6종(Metric Filter 결과) - 전부 dimension 없는 카운터라 값만 나열.
    # 뒤 3개는 room 분산 락 관련이며, RedisLockRenewFailure만 Alarm이 없다(하트비트 1회 실패는
    # lease 만료 전에 회복되면 정상이라, 여기 추이로 Redis 연결 품질의 선행 지표로만 본다).
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
          [var.game_metric_namespace, "RedisLockRenewFailure"],
          [var.game_metric_namespace, "RoomLockLeaseLost"],
          [var.game_metric_namespace, "StaleFencingWriteRejected"],
        ]
      }
    },
    # API 자원 부족 여부 - 3단계(ECS Fargate 이관)에서 API가 ECS로 전환된 뒤에는 API
    # 런타임 자원 상태를 AWS/ECS Service CPU/MemoryUtilization으로 본다(app_a EC2 CPU/Memory는
    # 더 이상 API를 반영하지 않는다 - 아래 "Game Resources (EC2)" 위젯 참고).
    {
      type   = "metric"
      x      = 0
      y      = 12
      width  = 12
      height = 6
      properties = {
        title  = "API Resources (ECS)"
        view   = "timeSeries"
        region = var.aws_region
        stat   = "Average"
        period = local.period
        yAxis = {
          left = { min = 0, max = 100 }
        }
        metrics = [
          ["AWS/ECS", "CPUUtilization", "ClusterName", var.ecs_cluster_name, "ServiceName", var.ecs_api_service_name, { label = "CPUUtilization" }],
          ["AWS/ECS", "MemoryUtilization", "ClusterName", var.ecs_cluster_name, "ServiceName", var.ecs_api_service_name, { label = "MemoryUtilization" }],
        ]
      }
    },
    # Game 자원 부족 여부 - 4단계 AIOps 보정(ECS Fargate 이관)에서 API 위젯(위)과 동일하게
    # ECS 기준으로 교체했다. app_a EC2는 정지 상태라 그 CPU/Memory는 더 이상 Game 부하를
    # 반영하지 않는다(game_traffic_target = "ecs" 전환 완료).
    {
      type   = "metric"
      x      = 12
      y      = 12
      width  = 12
      height = 6
      properties = {
        title  = "Game Resources (ECS)"
        view   = "timeSeries"
        region = var.aws_region
        stat   = "Average"
        period = local.period
        yAxis = {
          left = { min = 0, max = 100 }
        }
        metrics = [
          ["AWS/ECS", "CPUUtilization", "ClusterName", var.ecs_cluster_name, "ServiceName", var.ecs_game_service_name, { label = "CPUUtilization" }],
          ["AWS/ECS", "MemoryUtilization", "ClusterName", var.ecs_cluster_name, "ServiceName", var.ecs_game_service_name, { label = "MemoryUtilization" }],
        ]
      }
    },
    # RDS가 병목인지 - CPU
    {
      type   = "metric"
      x      = 0
      y      = 18
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
      x      = 12
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
      x      = 0
      y      = 24
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
