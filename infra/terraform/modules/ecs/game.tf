# apps/game ECS Fargate 태스크 정의/서비스. ECS Fargate 이관 4단계
# (docs/infra/ecs-fargate-migration-plan.md) - 2단계에서 만든 apps/api 패턴(main.tf)을
# 그대로 따르되, 이번 단계 범위에서는 aws-otel-collector 사이드카(3단계에서 api에 추가한
# 트레이싱용 사이드카)를 넣지 않는다 - 계획 문서 4단계 항목이 "최소 로그/metric/alarm"만
# 요구하고, game은 아직 OTEL_EXPORTER_OTLP_ENDPOINT를 설정하지 않으므로
# packages/tracing이 production에서 트레이싱 자체를 비활성화한다(3단계 api_environment_variables
# 주석과 동일한 동작). 필요해지면 이후 단계에서 api와 동일하게 사이드카를 추가한다.
resource "aws_ecs_task_definition" "game" {
  family                   = "${var.project_name}-game"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.game_task_cpu
  memory                   = var.game_task_memory
  execution_role_arn       = var.game_execution_role_arn
  # apps/game은 지금 AWS SDK를 직접 쓰지 않는다(iam 모듈 ecs.tf 주석 참고) - Task Role이
  # 없는 컨테이너는 이 필드를 생략할 수 있으므로 var.game_task_role_arn이 null이면
  # 그대로 null을 전달한다(AWS 요청에서 필드 자체가 빠진다).
  task_role_arn = var.game_task_role_arn

  container_definitions = jsonencode([
    {
      name      = "game"
      image     = "${var.game_repository_url}:sha-${var.game_image_git_sha}"
      essential = true

      portMappings = [
        {
          containerPort = var.game_port
          protocol      = "tcp"
        }
      ]

      environment = [
        for name, value in var.game_environment_variables : { name = name, value = value }
      ]

      secrets = [
        for name, arn in var.game_secret_arns : { name = name, valueFrom = arn }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = var.game_log_group_name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }

      # api(main.tf)와 동일한 원칙 - liveness(/health)는 컨테이너 헬스체크,
      # readiness(/ready, Redis 연결 확인)는 ALB 타겟그룹 헬스체크(load_balancer 모듈의
      # game_ecs 타겟그룹)가 맡는다.
      healthCheck = {
        command = [
          "CMD-SHELL",
          "node -e \"require('http').get('http://localhost:${var.game_port}/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))\""
        ]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 30
      }
    }
  ])

  tags = {
    Name    = "${var.project_name}-game"
    Service = "game"
  }
}

resource "aws_ecs_service" "game" {
  name            = "${var.project_name}-game"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.game.arn
  desired_count   = var.game_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets = var.public_subnet_ids
    # api(main.tf)와 동일 - NAT 없이 public 서브넷 + public IP로 아웃바운드를 확보하고,
    # 인바운드는 ecs_game SG(ALB에서만 허용)로 막는다.
    security_groups  = [var.ecs_game_security_group_id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = var.game_target_group_arn
    container_name   = "game"
    container_port   = var.game_port
  }

  health_check_grace_period_seconds = var.game_health_check_grace_period_seconds

  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  tags = {
    Name    = "${var.project_name}-game"
    Service = "game"
  }
}
