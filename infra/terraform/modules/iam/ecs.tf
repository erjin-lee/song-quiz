# ECS Fargate 이관 2단계(docs/infra/ecs-fargate-migration-plan.md) - apps/api Fargate
# 태스크가 쓰는 두 역할. 성격이 다르다:
#   - Task Execution Role: ECS 에이전트가 컨테이너를 "시작하기 위해" 쓰는 역할(ECR
#     이미지 pull, SSM Parameter Store 시크릿 복호화, awslogs로 로그 쓰기). 애플리케이션
#     코드는 이 역할의 자격증명에 접근하지 못한다.
#   - Task Role: 컨테이너 "안에서 실행 중인 애플리케이션 코드"가 AWS SDK로 쓰는 역할
#     (SES 발신 등) - EC2의 app 역할(위)과 같은 역할을 ECS에서 대신한다.

resource "aws_iam_role" "ecs_api_task_execution" {
  name = "${var.project_name}-ecs-api-task-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "ecs-tasks.amazonaws.com" }
        Action    = "sts:AssumeRole"
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-ecs-api-task-execution"
  }
}

resource "aws_iam_role_policy" "ecs_api_task_execution_ecr" {
  name = "${var.project_name}-ecs-api-task-execution-ecr"
  role = aws_iam_role.ecs_api_task_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # ecr:GetAuthorizationToken은 리포지토리 단위로 범위를 좁힐 수 없는 계정 레벨
        # 액션이다(publish-ecr.yml의 ci_ecr_push 정책과 동일한 이유).
        Effect   = "Allow"
        Action   = "ecr:GetAuthorizationToken"
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
        ]
        Resource = var.ecr_api_repository_arn
      }
    ]
  })
}

# app_cloudwatch_logs(위, EC2용)와 같은 이유로 CreateLogStream/PutLogEvents만 준다 -
# Log Group 자체는 logging 모듈이 미리 만들어두므로 CreateLogGroup은 필요 없다.
resource "aws_iam_role_policy" "ecs_api_task_execution_logs" {
  name = "${var.project_name}-ecs-api-task-execution-logs"
  role = aws_iam_role.ecs_api_task_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ]
        Resource = "${var.api_log_group_arn}:*"
      }
    ]
  })
}

resource "aws_iam_role_policy" "ecs_api_task_execution_ssm" {
  name = "${var.project_name}-ecs-api-task-execution-ssm"
  role = aws_iam_role.ecs_api_task_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "ssm:GetParameters"
        Resource = var.ecs_api_secret_arns
      },
      {
        # var.ecs_api_secrets_kms_key_arn은 secrets.tf가 만든 전용 KMS 키다(기본
        # alias/aws/ssm이 아니다) - 이 키의 정책 자체가 Decrypt를 이 역할에게만
        # 허용하므로, 여기 IAM 정책의 kms:Decrypt는 그 허용을 실제로 쓰기 위한
        # 반대쪽 절반이다(키 정책 + IAM 정책 둘 다 허용해야 동작).
        Effect   = "Allow"
        Action   = "kms:Decrypt"
        Resource = var.ecs_api_secrets_kms_key_arn
      }
    ]
  })
}

resource "aws_iam_role" "ecs_api_task" {
  name = "${var.project_name}-ecs-api-task"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "ecs-tasks.amazonaws.com" }
        Action    = "sts:AssumeRole"
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-ecs-api-task"
  }
}

# app_ses_send(위, EC2용)와 동일한 최소 권한을 ECS 태스크 역할에도 그대로 준다.
resource "aws_iam_role_policy" "ecs_api_task_ses_send" {
  name = "${var.project_name}-ecs-api-task-ses-send"
  role = aws_iam_role.ecs_api_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["ses:SendEmail", "ses:SendRawEmail"]
        Resource = var.ses_domain_identity_arn
      }
    ]
  })
}

# app_xray_write(main.tf, EC2용)와 동일한 최소 권한 - 3단계(트레이싱)에서 추가한
# aws-otel-collector 사이드카(main.tf)가 이 Task Role 자격증명으로 X-Ray에 쓴다(사이드카도
# Task Execution Role이 아니라 Task Role을 쓴다). xray:PutTraceSegments/PutTelemetryRecords는
# 리소스 수준 권한을 지원하지 않는 계정 전역 액션이라 Resource가 "*"일 수밖에 없다.
resource "aws_iam_role_policy" "ecs_api_task_xray_write" {
  name = "${var.project_name}-ecs-api-task-xray-write"
  role = aws_iam_role.ecs_api_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "xray:PutTraceSegments",
          "xray:PutTelemetryRecords",
        ]
        Resource = "*"
      }
    ]
  })
}

# ECS Fargate 이관 4단계 - apps/game Fargate 태스크의 Task Execution Role. ecs_api_task_execution과
# 같은 성격(ECR pull, awslogs, SSM 시크릿 복호화)이지만 대상 리포지토리/로그 그룹/시크릿이 다르다.
#
# 4단계 당시에는 apps/game 애플리케이션 코드가 AWS SDK를 직접 쓰지 않아(SES 발신 없음, X-Ray
# 사이드카도 그 단계 범위 밖) ecs_api_task 같은 별도 Task Role을 만들지 않았다. Game tracing
# 추가(아래 ecs_game_task)에서 X-Ray 사이드카가 필요해져 Task Role을 새로 만들었다.
resource "aws_iam_role" "ecs_game_task_execution" {
  name = "${var.project_name}-ecs-game-task-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "ecs-tasks.amazonaws.com" }
        Action    = "sts:AssumeRole"
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-ecs-game-task-execution"
  }
}

resource "aws_iam_role_policy" "ecs_game_task_execution_ecr" {
  name = "${var.project_name}-ecs-game-task-execution-ecr"
  role = aws_iam_role.ecs_game_task_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "ecr:GetAuthorizationToken"
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
        ]
        Resource = var.ecr_game_repository_arn
      }
    ]
  })
}

resource "aws_iam_role_policy" "ecs_game_task_execution_logs" {
  name = "${var.project_name}-ecs-game-task-execution-logs"
  role = aws_iam_role.ecs_game_task_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ]
        # EC2 CloudWatch Agent(main.tf의 app_cloudwatch_logs)가 쓰는 것과 동일한
        # Log Group ARN(var.game_log_group_arn) - 3단계에서 apps/api ECS도 기존
        # Log Group을 그대로 재사용한 것과 같은 이유다.
        Resource = "${var.game_log_group_arn}:*"
      }
    ]
  })
}

# USER_JWT_SECRET/INTERNAL_SERVICE_SECRET은 apps/api와 값을 공유하는 시크릿이라(ADR-0004,
# environments/prod/secrets.tf) 별도 SSM 파라미터/KMS 키를 새로 만들지 않고 apps/api가 쓰는
# 것과 동일한 파라미터 ARN/KMS 키를 그대로 참조한다 - 값이 두 군데로 갈라지는 것을 막기 위함이다.
resource "aws_iam_role_policy" "ecs_game_task_execution_ssm" {
  name = "${var.project_name}-ecs-game-task-execution-ssm"
  role = aws_iam_role.ecs_game_task_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "ssm:GetParameters"
        Resource = var.ecs_game_secret_arns
      },
      {
        Effect   = "Allow"
        Action   = "kms:Decrypt"
        Resource = var.ecs_game_secrets_kms_key_arn
      }
    ]
  })
}

# Game tracing 추가(4단계 AIOps 보정 이후 후속 작업) - ecs_api_task와 동일한 성격의 Task
# Role. apps/game은 여전히 SES 등 다른 AWS SDK 호출은 없어 X-Ray 쓰기 권한 하나만 준다.
resource "aws_iam_role" "ecs_game_task" {
  name = "${var.project_name}-ecs-game-task"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "ecs-tasks.amazonaws.com" }
        Action    = "sts:AssumeRole"
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-ecs-game-task"
  }
}

# ecs_api_task_xray_write와 동일한 이유/권한 - Game의 aws-otel-collector 사이드카
# (modules/ecs/game.tf)가 이 Task Role 자격증명으로 X-Ray에 쓴다.
resource "aws_iam_role_policy" "ecs_game_task_xray_write" {
  name = "${var.project_name}-ecs-game-task-xray-write"
  role = aws_iam_role.ecs_game_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "xray:PutTraceSegments",
          "xray:PutTelemetryRecords",
        ]
        Resource = "*"
      }
    ]
  })
}
