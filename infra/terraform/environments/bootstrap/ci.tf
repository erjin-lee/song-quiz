# GitHub Actions가 장기 액세스 키 없이 임시 AWS 자격증명을 받아갈 수 있게 해주는
# OIDC(OpenID Connect) 자격증명 공급자. 워크플로우 실행마다 GitHub가 발급한 토큰으로
# 아래 IAM Role을 맡는다(AssumeRoleWithWebIdentity) - 계정에 저장해두는 고정 키가 없어도 된다.
resource "aws_iam_openid_connect_provider" "github_actions" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]

  # GitHub Actions OIDC의 루트 CA 지문(고정값, GitHub 공식 문서 기준).
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

# CI(PR)에서 terraform plan만 실행하기 위한 role. apply 권한은 주지 않는다 -
# 실제 인프라를 바꾸는 apply는 개발자가 로컬에서 직접 실행한다는 이 프로젝트의 원칙 때문이다.
resource "aws_iam_role" "ci_terraform_plan" {
  name = "${var.project_name}-ci-terraform-plan"

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
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }
          # 이 저장소에서 실행된 워크플로우만 이 role을 맡을 수 있도록 제한한다.
          # (다른 레포가 같은 OIDC provider를 통해 이 role을 도용하는 것을 막는다.)
          StringLike = {
            "token.actions.githubusercontent.com:sub" = "repo:${var.github_repository}:*"
          }
        }
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-ci-terraform-plan"
  }
}

# plan은 실제 AWS 리소스 상태를 읽어(refresh) state와 비교해야 하므로 여러 서비스에 대한
# 읽기 권한이 필요하다. AWS 관리형 ReadOnlyAccess로 폭넓게 조회 권한만 부여하고,
# 생성/수정/삭제 권한은 전혀 주지 않는다.
resource "aws_iam_role_policy_attachment" "ci_terraform_plan_read_only" {
  role       = aws_iam_role.ci_terraform_plan.name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

# S3 네이티브 락(use_lockfile)은 plan 중에도 락 오브젝트를 실제로 쓰고 지운다.
# ReadOnlyAccess에는 쓰기 권한이 없으므로, state 버킷 안에서만 별도로 허용한다.
resource "aws_iam_role_policy" "ci_terraform_state_access" {
  name = "${var.project_name}-ci-terraform-state-access"
  role = aws_iam_role.ci_terraform_plan.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = aws_s3_bucket.terraform_state.arn
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
        ]
        Resource = "${aws_s3_bucket.terraform_state.arn}/*"
      }
    ]
  })
}
