# ECS 클러스터(api/game 공용) + apps/api 태스크 정의/서비스. ECS Fargate 이관 2단계
# (docs/infra/ecs-fargate-migration-plan.md) 산출물이다. apps/game 태스크 정의/서비스는
# 4단계에서 game.tf에 별도 파일로 추가했다 - api 전용으로 시작한 이 파일을 계속 부풀리지
# 않기 위함(infra/terraform/CLAUDE.md의 "main.tf만 리소스 종류별로 쪼갠다" 원칙).

resource "aws_ecs_cluster" "main" {
  name = "${var.project_name}-cluster"

  tags = {
    Name = "${var.project_name}-cluster"
  }
}

# ADOT Collector 사이드카 설정(3단계 - docs/infra/ecs-fargate-migration-plan.md). EC2에서는
# CloudWatch Agent가 127.0.0.1:4318에서 OTLP를 받아 X-Ray로 보내주지만
# (environments/prod/cloudwatch-agent/amazon-cloudwatch-agent.json), ECS Task에는 그 역할을
# 할 host-level agent가 없다 - 대신 같은 Task 안에 Collector 컨테이너를 사이드카로 띄운다.
# awsvpc network mode라 api/otel-collector 두 컨테이너가 네트워크 네임스페이스를 공유하므로
# api는 그대로 localhost:4318로 보내면 된다(EC2와 동일한 포트로 맞춰 둘을 대칭시켰다).
#
# 설정 파일을 별도 S3/SSM 리소스로 만들지 않고 AOT_CONFIG_CONTENT 환경변수(ADOT Collector가
# 공식 지원하는 "--config=env:AOT_CONFIG_CONTENT" 방식)로 YAML을 직접 주입한다 - 시크릿이
# 아니므로 secrets(SSM)가 아니라 environment로 충분하다.
locals {
  otel_collector_config = yamlencode({
    receivers = {
      otlp = {
        protocols = {
          http = {
            endpoint = "0.0.0.0:4318"
          }
        }
      }
    }
    processors = {
      batch = {}
    }
    exporters = {
      awsxray = {
        region = var.aws_region
      }
    }
    service = {
      pipelines = {
        traces = {
          receivers  = ["otlp"]
          processors = ["batch"]
          exporters  = ["awsxray"]
        }
      }
    }
  })
}

# container_definitions는 environment(평문)와 secrets(SSM Parameter Store ARN 참조)
# 두 종류로 나뉜다 - 실제 값은 environments/prod가 map으로 넘겨주고, 이 모듈은 그 map을
# ECS가 요구하는 {name, value}/{name, valueFrom} 리스트 형태로만 변환한다(값 자체를
# 모른 채로 배관 역할만 한다).
resource "aws_ecs_task_definition" "api" {
  family                   = "${var.project_name}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.api_task_cpu
  memory                   = var.api_task_memory
  execution_role_arn       = var.execution_role_arn
  task_role_arn            = var.task_role_arn

  container_definitions = jsonencode([
    {
      name      = "api"
      image     = "${var.api_repository_url}:sha-${var.api_image_git_sha}"
      essential = true

      portMappings = [
        {
          containerPort = var.app_port
          protocol      = "tcp"
        }
      ]

      environment = [
        for name, value in var.environment_variables : { name = name, value = value }
      ]

      secrets = [
        for name, arn in var.secret_arns : { name = name, valueFrom = arn }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = var.api_log_group_name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }

      # ECS 에이전트가 컨테이너 자체의 liveness만 본다(/health - 프로세스가 응답하는지).
      # DB/Redis 연결까지 확인하는 readiness(/ready)는 ALB 타겟그룹 헬스체크가 담당한다
      # (load_balancer 모듈의 app_ecs 타겟그룹 참고) - 둘을 같은 경로로 합치면 DB/Redis
      # 장애 시 ECS가 "컨테이너가 안 살아있다"고 오판해 계속 재시작을 반복하게 된다.
      # curl/wget이 없는 node:24-slim 이미지라 node 내장 http 모듈로 직접 확인한다.
      healthCheck = {
        command = [
          "CMD-SHELL",
          "node -e \"require('http').get('http://localhost:${var.app_port}/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))\""
        ]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 30
      }
    },
    {
      name  = "aws-otel-collector"
      image = var.otel_collector_image
      # essential=false - 사이드카가 죽어도(트레이스 export 실패) api 컨테이너/Task 전체를
      # 함께 종료시키지 않는다. 트레이싱은 부가 관측 기능이지 서비스 가용성 요건이 아니다.
      essential = false
      cpu       = var.otel_collector_cpu
      memory    = var.otel_collector_memory

      command = ["--config=env:AOT_CONFIG_CONTENT"]

      environment = [
        { name = "AOT_CONFIG_CONTENT", value = local.otel_collector_config }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = var.api_log_group_name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs-otel"
        }
      }
    }
  ])

  tags = {
    Name    = "${var.project_name}-api"
    Service = "api"
  }
}

resource "aws_ecs_service" "api" {
  name            = "${var.project_name}-api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.api_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets = var.public_subnet_ids
    # NAT Gateway 없이 public 서브넷 + public IP로 아웃바운드(ECR/SSM/CloudWatch Logs)를
    # 확보한다 - 인바운드는 SG(ecs_api, ALB에서만 허용)로 막혀 있어 public IP를 가져도
    # 인터넷에서 컨테이너 포트로 직접 접근할 수 없다. 계획 문서 배경 섹션 참고.
    security_groups  = [var.ecs_api_security_group_id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = var.api_target_group_arn
    container_name   = "api"
    container_port   = var.app_port
  }

  # 태스크가 뜬 직후에는 ALB readiness 체크(/ready, DB/Redis 연결 확인)가 아직 실패
  # 상태일 수 있다 - 이 유예 기간 동안은 unhealthy 판정이 나와도 ECS가 태스크를 죽이지
  # 않고 계속 기다린다(그 이후에는 정상적으로 unhealthy 처리).
  health_check_grace_period_seconds = var.api_health_check_grace_period_seconds

  # 새 태스크가 타겟그룹 헬스체크를 통과할 때까지 기다렸다가 이전 태스크를 종료한다
  # (rolling update). desired_count=1인 stage 2 시점에는 배포 중 순간적으로 태스크가
  # 2개(신규 1 + 기존 1) 떠 있는 상태를 거친다 - 다운타임 없이 교체하기 위한 트레이드오프.
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  # ECS Fargate 이관 5단계(docs/infra/ecs-fargate-migration-plan.md, autoscaling.tf) -
  # Application Auto Scaling이 desired_count를 직접 조정한다. 이 필드를 계속 var.api_desired_count로
  # 관리하면 Auto Scaling이 늘려놓은 태스크 수를 다음 terraform apply가 그대로 되돌려버린다
  # (apps/lambda의 CI 배포 vs terraform apply 충돌과 같은 종류의 문제 - apps/lambda/CLAUDE.md
  # 참고). var.api_desired_count는 이제 aws_appautoscaling_target의 최초 생성 시 initial
  # capacity로만 쓰인다.
  lifecycle {
    ignore_changes = [desired_count]
  }

  tags = {
    Name    = "${var.project_name}-api"
    Service = "api"
  }
}
