# .github/workflows/deploy-api.yml(3단계 - ECS Fargate 이관, docs/infra/ecs-fargate-migration-plan.md)이
# ECR push + ECS Task Definition 새 리비전 등록 + Service 갱신을 할 때 assume할 role.
#
# ci_ecr_push(ecr-push.tf)를 재사용하지 않는다 - 그 role은 publish-ecr.yml(수동 실행,
# 아직 어떤 배포에도 연결되지 않은 검증 전용 워크플로우) 전용으로 OIDC workflow 조건이
# 좁혀져 있고, api/game 이미지 모두를 push할 수 있다. 이 role은 실제 Production 배포
# 경로이므로 별도로 두고, ECR push 권한도 api 리포지토리 하나로만 좁힌다(game은 아직
# 5단계 전까지 이 workflow의 대상이 아니다).
#
# execution_role_arn/task_role_arn은 bootstrap과 prod가 서로 다른 state를 써서 module
# output을 참조할 수 없으므로(§ci_deploy_metadata/ci_ecr_push와 동일한 이유), modules/iam/ecs.tf가
# 실제로 만드는 이름("${project_name}-ecs-api-task-execution"/"${project_name}-ecs-api-task")과
# 정확히 같은 문자열로 ARN을 직접 구성한다 - project_name이 바뀌면 이 파일도 함께 갱신해야 한다.
locals {
  ecs_api_cluster_name            = "${var.project_name}-cluster"
  ecs_api_service_name            = "${var.project_name}-api"
  ecs_api_task_execution_role     = "${var.project_name}-ecs-api-task-execution"
  ecs_api_task_role               = "${var.project_name}-ecs-api-task"
  ecs_api_service_arn             = "arn:aws:ecs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:service/${local.ecs_api_cluster_name}/${local.ecs_api_service_name}"
  ecs_api_task_execution_role_arn = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${local.ecs_api_task_execution_role}"
  ecs_api_task_role_arn           = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${local.ecs_api_task_role}"
}

resource "aws_iam_role" "ci_ecs_deploy" {
  name = "${var.project_name}-ci-ecs-deploy"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = aws_iam_openid_connect_provider.github_actions.arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        # ci_deploy_metadata(deploy-metadata.tf)와 동일한 원칙 - aud/repository/sub/ref/
        # workflow 전부 StringEquals로 정확히 매치, 와일드카드는 쓰지 않는다.
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud"        = "sts.amazonaws.com"
            "token.actions.githubusercontent.com:repository" = var.github_repository
            "token.actions.githubusercontent.com:sub"        = "${local.github_oidc_subject_prefix}:ref:refs/heads/main"
            "token.actions.githubusercontent.com:ref"        = "refs/heads/main"
            "token.actions.githubusercontent.com:workflow"   = "Deploy API"
          }
        }
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-ci-ecs-deploy"
  }
}

# ecr-push.tf(ci_ecr_push)의 ECR 정책과 동일한 액션 - api 리포지토리 하나로만 Resource를 좁힌다.
resource "aws_iam_role_policy" "ci_ecs_deploy_ecr" {
  name = "${var.project_name}-ci-ecs-deploy-ecr"
  role = aws_iam_role.ci_ecs_deploy.id

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
        Resource = "arn:aws:ecr:${var.aws_region}:${data.aws_caller_identity.current.account_id}:repository/${var.project_name}-api"
      }
    ]
  })
}

# RegisterTaskDefinition/DescribeTaskDefinition은 AWS가 리소스 수준 권한을 지원하지
# 않는 액션이라(공식 문서 "Actions, resources, and condition keys for Amazon ECS" 기준)
# Resource가 "*"일 수밖에 없다 - 대신 UpdateService/DescribeServices는 이 API의 ECS
# Service ARN 하나로 좁히고, PassRole은 이 Task가 실제로 쓰는 두 Role ARN으로만 좁힌다.
resource "aws_iam_role_policy" "ci_ecs_deploy_ecs" {
  name = "${var.project_name}-ci-ecs-deploy-ecs"
  role = aws_iam_role.ci_ecs_deploy.id

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
        Resource = local.ecs_api_service_arn
      },
      {
        # 이 role이 다른 임의의 role을 ECS Task에 넘기지 못하도록, PassRole 대상을
        # 이 Task가 실제로 쓰는 두 Role로 좁히고 iam:PassedToService 조건까지 더한다
        # (AWS 공식 권장 패턴 - "Granting a user permissions to pass a role to an
        # AWS service").
        Effect   = "Allow"
        Action   = "iam:PassRole"
        Resource = [local.ecs_api_task_execution_role_arn, local.ecs_api_task_role_arn]
        Condition = {
          StringEquals = {
            "iam:PassedToService" = "ecs-tasks.amazonaws.com"
          }
        }
      }
    ]
  })
}
