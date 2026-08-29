# .github/workflows/deploy-game.yml(4단계 - ECS Fargate 이관, docs/infra/ecs-fargate-migration-plan.md)이
# ECR push + ECS Task Definition 새 리비전 등록 + Service 갱신을 할 때 assume할 role.
#
# ecs-deploy.tf(ci_ecs_deploy, apps/api 전용)를 재사용하지 않는다 - 그 role의 OIDC 조건이
# workflow="Deploy API"로 좁혀져 있어 "Deploy Game" workflow는 애초에 assume이 거부된다.
#
# 4단계 당시에는 apps/game에 Task Role이 없어 PassRole 대상이 Task Execution Role
# 하나뿐이었다. Game tracing 추가(4단계 AIOps 보정 이후 후속 작업)에서 aws-otel-collector
# 사이드카가 X-Ray에 쓸 Task Role(ecs_game_task, modules/iam/ecs.tf)이 새로 생겨 Game
# Task Definition의 taskRoleArn에도 값이 채워졌다 - ecs-deploy.tf(api)와 동일한 이유로
# PassRole 대상에 이 Role도 추가해야 register-task-definition이 taskRoleArn을 넘길 때
# AccessDenied가 나지 않는다.
locals {
  ecs_game_cluster_name            = "${var.project_name}-cluster"
  ecs_game_service_name            = "${var.project_name}-game"
  ecs_game_task_execution_role     = "${var.project_name}-ecs-game-task-execution"
  ecs_game_task_role               = "${var.project_name}-ecs-game-task"
  ecs_game_service_arn             = "arn:aws:ecs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:service/${local.ecs_game_cluster_name}/${local.ecs_game_service_name}"
  ecs_game_task_execution_role_arn = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${local.ecs_game_task_execution_role}"
  ecs_game_task_role_arn           = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${local.ecs_game_task_role}"
}

resource "aws_iam_role" "ci_ecs_deploy_game" {
  name = "${var.project_name}-ci-ecs-deploy-game"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = aws_iam_openid_connect_provider.github_actions.arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud"        = "sts.amazonaws.com"
            "token.actions.githubusercontent.com:repository" = var.github_repository
            "token.actions.githubusercontent.com:sub"        = "${local.github_oidc_subject_prefix}:ref:refs/heads/main"
            "token.actions.githubusercontent.com:ref"        = "refs/heads/main"
            "token.actions.githubusercontent.com:workflow"   = "Deploy Game"
          }
        }
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-ci-ecs-deploy-game"
  }
}

resource "aws_iam_role_policy" "ci_ecs_deploy_game_ecr" {
  name = "${var.project_name}-ci-ecs-deploy-game-ecr"
  role = aws_iam_role.ci_ecs_deploy_game.id

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
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload",
          "ecr:PutImage",
          "ecr:BatchGetImage",
          "ecr:DescribeImages",
        ]
        Resource = "arn:aws:ecr:${var.aws_region}:${data.aws_caller_identity.current.account_id}:repository/${var.project_name}-game"
      }
    ]
  })
}

resource "aws_iam_role_policy" "ci_ecs_deploy_game_ecs" {
  name = "${var.project_name}-ci-ecs-deploy-game-ecs"
  role = aws_iam_role.ci_ecs_deploy_game.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ecs:RegisterTaskDefinition",
          "ecs:DescribeTaskDefinition",
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "ecs:UpdateService",
          "ecs:DescribeServices",
        ]
        Resource = local.ecs_game_service_arn
      },
      {
        # ecs-deploy.tf(api)와 동일한 이유 - 이 role이 다른 임의의 role을 ECS Task에
        # 넘기지 못하도록 PassRole 대상을 이 Task가 실제로 쓰는 두 Role로 좁히고
        # iam:PassedToService 조건까지 더한다.
        Effect   = "Allow"
        Action   = "iam:PassRole"
        Resource = [local.ecs_game_task_execution_role_arn, local.ecs_game_task_role_arn]
        Condition = {
          StringEquals = {
            "iam:PassedToService" = "ecs-tasks.amazonaws.com"
          }
        }
      }
    ]
  })
}
