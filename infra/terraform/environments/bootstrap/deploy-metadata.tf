# Deploy workflow(.github/workflows/deploy-api.yml, deploy-game.yml)가 Production 배포
# 성공 후 실제 배포된 commit/PR 정보를 SSM Parameter Store에 기록할 때 assume할 role.
#
# 현재 deploy-api.yml/deploy-game.yml에는 AWS 인증 구조가 전혀 없다(SSH로 bastion 경유
# WAS에 접속해 git pull + PM2 reload만 한다) - 이번 작업으로 그 워크플로우가 처음으로
# AWS를 호출하게 되므로, 기존 ci_terraform_plan role을 재사용하지 않고(그 role은
# ReadOnlyAccess 전체를 갖고 있어 이 용도에는 과도하게 넓다) 정확히 ssm:PutParameter
# 2개 Resource만 갖는 새 role을 만든다(§18).
locals {
  # GitHub Actions OIDC "immutable subject claim"(2026-04-23 발표, 2026-07-15부터 신규
  # 생성/rename/transfer되는 저장소에 자동 적용 -
  # https://github.blog/changelog/2026-04-23-immutable-subject-claims-for-github-actions-oidc-tokens/).
  # 이 저장소(erjin-lee/song-quiz)는 2026-08-09 생성되어 이미 이 새 포맷을 쓴다 - 실제 값은
  #   gh api repos/erjin-lee/song-quiz/actions/oidc/customization/sub
  # 로 직접 확인했다(2026-08-24 기준 sub_claim_prefix):
  #   "repo:erjin-lee@31759793/song-quiz@1328281800"
  # owner/repository 뒤에 붙은 숫자는 GitHub가 절대 재사용하지 않는 불변 ID라 저장소를
  # rename/transfer해도 값이 바뀌지 않는다 - 저장소를 삭제 후 완전히 새로 만드는 경우에만
  # 위 API로 다시 확인해서 이 local을 갱신해야 한다. 이 값을 그대로 정확히 매치(StringEquals)
  # 시키므로 예전처럼 "repo:*:ref:refs/heads/main"처럼 owner/repo 부분을 와일드카드로 열어둘
  # 필요가 없다(§1 - 범위를 정확히 이 저장소 하나로 좁힌다).
  github_oidc_subject_prefix = "repo:erjin-lee@31759793/song-quiz@1328281800"

  # sub만으로는 "이 저장소의 main"까지만 제한되고 어떤 workflow가 실행됐는지는 구분하지 못한다.
  # job_workflow_ref는 쓰지 않는다 - GitHub 공식 문서(OIDC token claims reference)가
  # "For jobs using a reusable workflow, the ref path to the reusable workflow"라고 명시하듯
  # **reusable workflow(jobs.<id>.uses로 다른 workflow 파일을 호출하는 job)에서만 채워지는
  # claim**이다. deploy-api.yml/deploy-game.yml은 둘 다 `jobs.deploy.runs-on` + `steps`로
  # 구성된 일반 top-level workflow이고(reusable workflow 호출 없음, .github/workflows 안에서
  # 확인함), 이 경우 job_workflow_ref 자체가 토큰에 아예 존재하지 않는다 - StringEquals가
  # 존재하지 않는 claim과는 매치될 수 없어 이 조건을 쓰면 role을 절대 assume할 수 없게 된다.
  # 대신 "workflow" claim(name: 값 그대로, 예: "Deploy API")으로 정확한 workflow를 구분한다 -
  # 이 claim은 reusable 여부와 무관하게 항상 채워진다.
  ci_deploy_metadata_workflow_names = [
    "Deploy API",  # .github/workflows/deploy-api.yml의 `name:` 값
    "Deploy Game", # .github/workflows/deploy-game.yml의 `name:` 값
  ]
}

resource "aws_iam_role" "ci_deploy_metadata" {
  name = "${var.project_name}-ci-deploy-metadata"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = aws_iam_openid_connect_provider.github_actions.arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        # 아래 조건은 전부 AND로 결합된다(같은 Statement 안의 여러 조건 key는 항상 AND).
        #   aud        - 이 토큰이 AWS STS를 대상으로 발급됐는지
        #   repository - 사람이 읽기 쉬운 이름 기반 확인(방어적 이중 확인)
        #   sub        - 불변 ID까지 포함한 정확한 저장소+브랜치 확인(§1, 값 그대로 유지)
        #   ref        - main 브랜치로의 실행만(sub 안에도 포함돼 있지만 명시적으로 한 번 더)
        #   workflow   - 정확히 이 두 workflow(이름 기준)만 - job_workflow_ref는 reusable
        #                workflow 전용이라 여기 쓰지 않는다(위 local 주석 참고)
        # 와일드카드(StringLike)는 어디에도 쓰지 않는다.
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud"        = "sts.amazonaws.com"
            "token.actions.githubusercontent.com:repository" = var.github_repository
            "token.actions.githubusercontent.com:sub"        = "${local.github_oidc_subject_prefix}:ref:refs/heads/main"
            "token.actions.githubusercontent.com:ref"        = "refs/heads/main"
            "token.actions.githubusercontent.com:workflow"   = local.ci_deploy_metadata_workflow_names
          }
        }
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-ci-deploy-metadata"
  }
}

# Deployment Metadata는 secret이 아니지만(String 타입, §11) 최소 권한 원칙은 동일하게
# 적용한다 - API/Game 각자의 배포 workflow가 자기 서비스 parameter만 쓸 수 있는 게
# 이상적이지만(§18), 두 workflow 모두 같은 GitHub 저장소의 main push로 트리거되고
# 이미 서로의 배포 코드를 변경할 수 있는 신뢰 경계라 role 하나로 두 Resource 모두
# 허용한다 - role을 서비스별로 쪼개는 이득보다 관리 복잡도가 더 크다고 판단했다.
resource "aws_iam_role_policy" "ci_deploy_metadata_ssm" {
  name = "${var.project_name}-ci-deploy-metadata-ssm"
  role = aws_iam_role.ci_deploy_metadata.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = "ssm:PutParameter"
        Resource = [
          "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${var.api_deployment_parameter_name}",
          "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${var.game_deployment_parameter_name}",
        ]
      }
    ]
  })
}
