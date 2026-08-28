# .github/workflows/publish-ecr.yml(ECS Fargate 이관 1단계 전용 - deploy-api.yml/
# deploy-game.yml과는 완전히 별개, docs/infra/ecs-fargate-migration-plan.md 참고)이 ECR에
# 이미지를 push할 때 assume할 role. 이 워크플로우는 수동 실행(workflow_dispatch)만 허용하고
# 아직 어떤 배포(ECS 서비스 업데이트)도 하지 않는다 - Docker 이미지를 빌드해 ECR에 올리는
# 것까지만 한다.
#
# ci_deploy_metadata와 마찬가지로 ci_terraform_plan(ReadOnlyAccess 전체)을 재사용하지 않고,
# ECR push에 정확히 필요한 액션만 갖는 새 role을 만든다.

resource "aws_iam_role" "ci_ecr_push" {
  name = "${var.project_name}-ci-ecr-push"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = aws_iam_openid_connect_provider.github_actions.arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        # 조건 구성은 ci_deploy_metadata(deploy-metadata.tf)와 동일한 원칙을 따른다 -
        # aud/repository/sub/ref/workflow를 전부 정확히 매치(StringEquals)시키고
        # 와일드카드는 쓰지 않는다. local.github_oidc_subject_prefix는
        # deploy-metadata.tf에 정의되어 있고, 같은 root module 안이라 여기서도 참조된다.
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud"        = "sts.amazonaws.com"
            "token.actions.githubusercontent.com:repository" = var.github_repository
            "token.actions.githubusercontent.com:sub"        = "${local.github_oidc_subject_prefix}:ref:refs/heads/main"
            "token.actions.githubusercontent.com:ref"        = "refs/heads/main"
            "token.actions.githubusercontent.com:workflow"   = "Publish ECR Images"
          }
        }
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-ci-ecr-push"
  }
}

resource "aws_iam_role_policy" "ci_ecr_push" {
  name = "${var.project_name}-ci-ecr-push"
  role = aws_iam_role.ci_ecr_push.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # ecr:GetAuthorizationToken은 리포지토리 단위로 범위를 좁힐 수 없는 계정 레벨
        # 액션이다 - AWS 문서가 명시하는 이 액션의 유일한 허용 Resource가 "*"다.
        Effect   = "Allow"
        Action   = "ecr:GetAuthorizationToken"
        Resource = "*"
      },
      {
        # api/game 리포지토리 이름은 modules/ecr(environments/prod)이 "${var.project_name}-api"/
        # "${var.project_name}-game"로 만든다 - 두 root가 state를 공유하지 않으므로(§ci_deploy_metadata
        # 와 동일한 이유) 모듈 output을 참조하는 대신 같은 project_name으로 ARN을 직접 구성한다.
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload",
          "ecr:PutImage",
          "ecr:BatchGetImage",
        ]
        Resource = [
          "arn:aws:ecr:${var.aws_region}:${data.aws_caller_identity.current.account_id}:repository/${var.project_name}-api",
          "arn:aws:ecr:${var.aws_region}:${data.aws_caller_identity.current.account_id}:repository/${var.project_name}-game",
        ]
      }
    ]
  })
}
