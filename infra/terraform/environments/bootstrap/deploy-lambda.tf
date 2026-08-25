# CI(GitHub Actions)가 apps/lambda/alarm-notifier, apps/lambda/incident-analyzer의 "코드"만
# terraform apply 없이 빠르게 배포할 때 assume할 role. deploy-api.yml/deploy-game.yml이
# EC2(WAS)에 SSH로 접속해 git pull + PM2 reload로 코드만 배포하고 인프라(환경변수/IAM/타이머
# 설정 등)는 건드리지 않는 것과 같은 패턴을, Lambda에서는 SSH 대신 `aws lambda
# update-function-code`로 구현한다. 인프라 자체(환경변수, IAM 정책, timeout, 새 리소스 등)는
# 여전히 terraform apply(로컬, 수동, environments/prod)의 몫이다 - 이 role은 "이미 존재하는
# 함수의 코드"만 바꿀 수 있고, 그 이상은 아무것도 못 한다.
locals {
  # modules/notification, modules/aiops의 name_prefix 기본값과 반드시 같아야 한다 - bootstrap과
  # prod는 서로 다른 state를 쓰기 때문에 module output을 직접 참조할 수 없다
  # (ci_deploy_metadata_workflow_names, api_deployment_parameter_name과 같은 이유,
  # deploy-metadata.tf 주석 참고).
  lambda_name_prefix = "song-quiz-prod"

  ci_deploy_lambda_workflow_names = [
    "Deploy Alarm Notifier Lambda",    # .github/workflows/deploy-alarm-notifier.yml의 `name:` 값
    "Deploy Incident Analyzer Lambda", # .github/workflows/deploy-incident-analyzer.yml의 `name:` 값
  ]

  alarm_notifier_function_arn    = "arn:aws:lambda:${var.aws_region}:${data.aws_caller_identity.current.account_id}:function:${local.lambda_name_prefix}-alarm-notifier"
  incident_analyzer_function_arn = "arn:aws:lambda:${var.aws_region}:${data.aws_caller_identity.current.account_id}:function:${local.lambda_name_prefix}-incident-analyzer"
}

# 신뢰 조건은 ci_deploy_metadata와 동일한 구조(§1, deploy-metadata.tf 주석 참고) - sub의
# immutable ID까지 정확히 매치하고, workflow claim으로 이 두 workflow만 허용한다.
resource "aws_iam_role" "ci_deploy_lambda" {
  name = "${var.project_name}-ci-deploy-lambda"

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
            "token.actions.githubusercontent.com:workflow"   = local.ci_deploy_lambda_workflow_names
          }
        }
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-ci-deploy-lambda"
  }
}

# 코드(zip) 업데이트 권한만 정확히 이 두 함수 ARN으로 좁힌다. 함수 생성/삭제나 설정(환경변수,
# IAM Role, timeout, memory 등) 변경 권한은 주지 않는다 - 그건 terraform apply만 할 수 있다.
# GetFunctionConfiguration은 update-function-code 이후 배포가 실제로 끝났는지(LastUpdateStatus)
# `aws lambda wait function-updated`로 확인하는 용도로만 쓴다 - 이 waiter는 GetFunction이
# 아니라 GetFunctionConfiguration을 폴링한다(AWS CLI 문서, aws lambda wait function-updated
# help 참고). GetFunction으로는 이 waiter가 AccessDenied로 실패한다.
resource "aws_iam_role_policy" "ci_deploy_lambda_update_code" {
  name = "${var.project_name}-ci-deploy-lambda-update-code"
  role = aws_iam_role.ci_deploy_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "lambda:UpdateFunctionCode",
          "lambda:GetFunctionConfiguration",
        ]
        Resource = [
          local.alarm_notifier_function_arn,
          local.incident_analyzer_function_arn,
        ]
      }
    ]
  })
}
