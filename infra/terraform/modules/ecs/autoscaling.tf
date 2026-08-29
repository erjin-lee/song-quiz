# ECS Fargate 이관 5단계(docs/infra/ecs-fargate-migration-plan.md) - api/game ECS
# Service에 Application Auto Scaling을 추가한다. 계획 문서가 명시한 대로 "초기 v1"은
# ECS Service CPU/MemoryUtilization 기준 Target Tracking 정책 두 개(CPU, Memory)만
# 두는 단순한 구성이다 - active Socket.IO connection 수 같은 custom metric은 이번
# 단계에서 다루지 않고, 실제로 CPU/Memory만으로 Game의 scaling signal이 충분한지
# 관찰한 뒤 후속 단계에서 재검토한다.
#
# Target Tracking 정책은 scale-out/scale-in 임계치를 하나의 목표값으로만 표현하고,
# 실제 스케일 인/아웃 판단과 cooldown은 AWS가 관리한다 - step scaling처럼 여러 개의
# 임계치 구간을 직접 정의할 필요가 없어 "단순하게 시작"하는 이번 단계에 맞다.
# scale_in_cooldown/scale_out_cooldown은 명시하지 않고 AWS 기본값(target tracking 기준
# 300초)을 그대로 쓴다 - 실제 트래픽 패턴을 관찰하기 전에 임의로 좁히면 오히려
# 불필요한 스케일링 흔들림(flapping)을 만들 수 있다.

resource "aws_appautoscaling_target" "api" {
  service_namespace  = "ecs"
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.api.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  min_capacity       = var.api_autoscaling_min_capacity
  max_capacity       = var.api_autoscaling_max_capacity
}

# apps/api는 RDS에 연결한다 - Task당 TypeORM/mysql2 기본 connection pool(10)을 그대로
# 쓰므로, max_capacity(변수 설명 참고)를 늘릴 때는 RDS max_connections(db.t3.micro
# 기준 약 85)를 함께 검토해야 한다. Task 수 × 10이 이 한도에 근접하지 않도록
# max_capacity를 보수적으로 유지한다.
resource "aws_appautoscaling_policy" "api_cpu" {
  name               = "${var.project_name}-api-cpu"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = aws_appautoscaling_target.api.service_namespace
  resource_id        = aws_appautoscaling_target.api.resource_id
  scalable_dimension = aws_appautoscaling_target.api.scalable_dimension

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value = var.api_autoscaling_cpu_target
  }
}

resource "aws_appautoscaling_policy" "api_memory" {
  name               = "${var.project_name}-api-memory"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = aws_appautoscaling_target.api.service_namespace
  resource_id        = aws_appautoscaling_target.api.resource_id
  scalable_dimension = aws_appautoscaling_target.api.scalable_dimension

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
    target_value = var.api_autoscaling_memory_target
  }
}

# apps/game은 WebSocket connection을 장시간 유지한다 - CPU/Memory Target Tracking만으로는
# scale-out 시 기존 connection이 새 Task로 재분배되지 않는다는 한계가 있다(계획 문서
# "Game multi-instance 관련 고려사항" 참고). 이번 단계는 계획대로 CPU/Memory로 시작하고,
# active connection/room 수 기반 custom metric은 실제 관찰 후 후속 단계에서 검토한다.
resource "aws_appautoscaling_target" "game" {
  service_namespace  = "ecs"
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.game.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  min_capacity       = var.game_autoscaling_min_capacity
  max_capacity       = var.game_autoscaling_max_capacity
}

resource "aws_appautoscaling_policy" "game_cpu" {
  name               = "${var.project_name}-game-cpu"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = aws_appautoscaling_target.game.service_namespace
  resource_id        = aws_appautoscaling_target.game.resource_id
  scalable_dimension = aws_appautoscaling_target.game.scalable_dimension

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value = var.game_autoscaling_cpu_target
  }
}

resource "aws_appautoscaling_policy" "game_memory" {
  name               = "${var.project_name}-game-memory"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = aws_appautoscaling_target.game.service_namespace
  resource_id        = aws_appautoscaling_target.game.resource_id
  scalable_dimension = aws_appautoscaling_target.game.scalable_dimension

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
    target_value = var.game_autoscaling_memory_target
  }
}
