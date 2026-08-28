# apps/api ECS Task Definition의 secrets(SSM Parameter Store SecureString)로 주입할
# 값들. EC2/PM2 시절에는 WAS 서버의 .env 파일로 넘기던 값이라 Terraform이 값 자체를
# 몰라도 됐지만, ECS Fargate에는 지속되는 서버가 없어 태스크가 시작할 때 어디선가 값을
# 받아와야 한다 - AWS 권장 방식대로 SSM Parameter Store(SecureString)에 저장해두고,
# 태스크 실행 역할이 시작 시점에만 복호화해서 컨테이너 환경변수로 주입한다(태스크 정의
# JSON/Terraform state 어디에도 평문으로 남지 않는다).
#
# 이 리소스들을 modules/iam이나 modules/ecs 안에 두지 않고 루트에 직접 만드는 이유:
# modules/iam(태스크 실행 역할의 ssm:GetParameters 정책)과 modules/ecs(태스크 정의의
# secrets 참조) 둘 다 이 파라미터들의 ARN이 필요하다 - 어느 한쪽 모듈 안에 두면 두
# 모듈이 서로를 참조하는 순환 참조가 생긴다. 루트가 두 모듈 모두에게 각자 필요한
# output만 나눠 전달하면 순환 없이 풀린다(db_password를 modules/database와 이 파일이
# 각각 독립적으로 받는 것과 같은 구조).

data "aws_caller_identity" "current" {}

locals {
  api_ssm_parameter_prefix = "/song-quiz/prod/api"
}

# 기본 AWS 관리형 키(alias/aws/ssm)를 쓰지 않고 이 KMS 키를 따로 만드는 이유: alias/aws/ssm의
# 키 정책은 "ssm.amazonaws.com이 ssm:GetParameter 권한을 가진 계정 내 어떤 principal을
# 대신해서도 복호화할 수 있다"고 광범위하게 위임되어 있다. 즉 IAM 정책에 kms:Decrypt를
# 전혀 갖지 않은 principal도 ssm:GetParameter --with-decryption 한 번이면 평문을 그대로
# 읽어갈 수 있다 - 예를 들어 PR마다 terraform plan을 실행하는 ci_terraform_plan role은
# AWS 관리형 ReadOnlyAccess만 붙어 있어(kms:Decrypt는 없음) 이 시크릿들을 못 읽어야
# 정상인데, alias/aws/ssm을 쓰면 ssm:Get*(ReadOnlyAccess에 포함) 하나로 admin/JWT/OpenAI
# 시크릿을 그대로 복호화할 수 있게 된다. 고객 관리형 키로 바꾸고 키 정책에서 kms:Decrypt를
# ECS Task Execution Role에게만 명시적으로 허용하면, ssm:GetParameter 권한이 있어도
# KMS 단계에서 막힌다.
resource "aws_kms_key" "api_secrets" {
  description             = "apps/api SSM Parameter Store(SecureString) 전용 - ECS Task Execution Role만 복호화 가능"
  deletion_window_in_days = 30

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # 계정 루트에 kms:*를 위임해야 IAM(관리자)이 이 키를 계속 관리(정책 변경, 태그,
        # 삭제 등)할 수 있다 - 이 문이 없으면 콘솔/CLI 어디서도 이 키 정책을 다시 바꿀
        # 방법이 없어진다. kms:Decrypt는 아래에서 ECS 역할에게만 별도로 허용하므로,
        # "관리자가 kms:*를 가진다"가 "다른 IAM principal이 자동으로 Decrypt를 얻는다"를
        # 뜻하지는 않는다 - 각 principal은 자기 IAM 정책에 kms:Decrypt를 별도로 가져야 한다.
        Sid       = "EnableIamUserPermissions"
        Effect    = "Allow"
        Principal = { AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root" }
        Action    = "kms:*"
        Resource  = "*"
      },
      {
        Sid    = "AllowEcsApiTaskExecutionDecrypt"
        Effect = "Allow"
        Principal = {
          # modules/iam의 output(ecs_api_task_execution_role_arn)을 직접 참조하면
          # module.iam이 이 키의 ARN을 입력으로 받아야 하는 구조와 순환 참조가 생긴다
          # (module.iam -> 이 키, 이 키 정책 -> module.iam). ecr-push.tf(bootstrap)에서
          # 이미 쓴 것과 같은 방식으로, project_name 네이밍 규칙 + account_id로 역할
          # ARN을 직접 구성해서 순환을 끊는다 - modules/iam/ecs.tf의 실제 역할 이름
          # ("${var.project_name}-ecs-api-task-execution")과 반드시 같아야 한다.
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${var.project_name}-ecs-api-task-execution"
        }
        Action   = ["kms:Decrypt", "kms:DescribeKey"]
        Resource = "*"
      }
    ]
  })

  tags = { Name = "${var.project_name}-api-secrets" }
}

resource "aws_kms_alias" "api_secrets" {
  name          = "alias/${var.project_name}-api-secrets"
  target_key_id = aws_kms_key.api_secrets.key_id
}

resource "aws_ssm_parameter" "api_db_password" {
  name   = "${local.api_ssm_parameter_prefix}/db-password"
  type   = "SecureString"
  key_id = aws_kms_key.api_secrets.key_id
  value  = var.db_password

  tags = { Name = "${var.project_name}-api-db-password" }
}

resource "aws_ssm_parameter" "api_admin_password" {
  name   = "${local.api_ssm_parameter_prefix}/admin-password"
  type   = "SecureString"
  key_id = aws_kms_key.api_secrets.key_id
  value  = var.admin_password

  tags = { Name = "${var.project_name}-api-admin-password" }
}

resource "aws_ssm_parameter" "api_admin_jwt_secret" {
  name   = "${local.api_ssm_parameter_prefix}/admin-jwt-secret"
  type   = "SecureString"
  key_id = aws_kms_key.api_secrets.key_id
  value  = var.admin_jwt_secret

  tags = { Name = "${var.project_name}-api-admin-jwt-secret" }
}

resource "aws_ssm_parameter" "api_user_jwt_secret" {
  name   = "${local.api_ssm_parameter_prefix}/user-jwt-secret"
  type   = "SecureString"
  key_id = aws_kms_key.api_secrets.key_id
  value  = var.user_jwt_secret

  tags = { Name = "${var.project_name}-api-user-jwt-secret" }
}

resource "aws_ssm_parameter" "api_gpt_secret_key" {
  name   = "${local.api_ssm_parameter_prefix}/gpt-secret-key"
  type   = "SecureString"
  key_id = aws_kms_key.api_secrets.key_id
  value  = var.gpt_secret_key

  tags = { Name = "${var.project_name}-api-gpt-secret-key" }
}

resource "aws_ssm_parameter" "api_internal_service_secret" {
  name   = "${local.api_ssm_parameter_prefix}/internal-service-secret"
  type   = "SecureString"
  key_id = aws_kms_key.api_secrets.key_id
  value  = var.internal_service_secret

  tags = { Name = "${var.project_name}-api-internal-service-secret" }
}

# api_docs_password는 기본값이 ""(Swagger 인증 미사용)다 - SSM PutParameter는 Value가
# 빈 문자열이면 ValidationException으로 실패하므로, 값이 실제로 있을 때만 파라미터
# 자체를 만든다(count). 없으면 아래 api_secret_arns map에도 API_DOCS_PASSWORD 키를
# 넣지 않는다 - modules/ecs가 존재하지 않는 키를 컨테이너 secrets로 참조하지 않는다.
resource "aws_ssm_parameter" "api_docs_password" {
  count = var.api_docs_password != "" ? 1 : 0

  name   = "${local.api_ssm_parameter_prefix}/docs-password"
  type   = "SecureString"
  key_id = aws_kms_key.api_secrets.key_id
  value  = var.api_docs_password

  tags = { Name = "${var.project_name}-api-docs-password" }
}

locals {
  # 이름은 컨테이너 환경변수 이름(apps/api가 process.env로 읽는 이름)과 정확히 같아야
  # 한다 - modules/ecs가 이 map을 그대로 ECS secrets 블록의 name으로 쓴다.
  api_secret_arns = merge(
    {
      DB_PASSWORD             = aws_ssm_parameter.api_db_password.arn
      ADMIN_PASSWORD          = aws_ssm_parameter.api_admin_password.arn
      ADMIN_JWT_SECRET        = aws_ssm_parameter.api_admin_jwt_secret.arn
      USER_JWT_SECRET         = aws_ssm_parameter.api_user_jwt_secret.arn
      GPT_SECRET_KEY          = aws_ssm_parameter.api_gpt_secret_key.arn
      INTERNAL_SERVICE_SECRET = aws_ssm_parameter.api_internal_service_secret.arn
    },
    length(aws_ssm_parameter.api_docs_password) > 0 ? {
      API_DOCS_PASSWORD = aws_ssm_parameter.api_docs_password[0].arn
    } : {}
  )
}
