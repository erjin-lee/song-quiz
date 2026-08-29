# apps/api ECS Task Definition의 secrets(SSM Parameter Store SecureString)로 주입할
# 값들. EC2/PM2 시절에는 WAS 서버의 .env 파일로 넘기던 값이라 Terraform이 값 자체를
# 몰라도 됐지만, ECS Fargate에는 지속되는 서버가 없어 태스크가 시작할 때 어디선가 값을
# 받아와야 한다 - AWS 권장 방식대로 SSM Parameter Store(SecureString)에 저장해두고,
# 태스크 실행 역할이 시작 시점에만 복호화해서 컨테이너 환경변수로 주입한다.
#
# value_wo(write-only, Terraform 1.11+)를 쓰는 이유: 일반 value = var.x로 쓰면 SSM에는
# 암호화되어 저장돼도 Terraform state에는 평문 그대로 남는다. 이 state는 S3에 있고,
# PR마다 도는 ci_terraform_plan role이 state 버킷에 s3:GetObject 권한을 갖고 있어(락/
# 조회에 필요, environments/bootstrap/ci.tf) KMS 키를 아무리 좁혀도 state를 직접 읽으면
# 우회된다. value_wo는 그 값을 애초에 state에 쓰지 않는다 - value_wo_version은 실제
# 값이 바뀌었을 때 갱신을 트리거하는 용도로만 쓰는 정수라, 값을 로테이션할 때 이 숫자를
# 올려야 한다(값 자체로는 변경 여부를 diff할 수 없으므로).
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
      # ECS Task Execution Role에게 별도 Principal 문을 여기 추가하지 않는다 - 위
      # EnableIamUserPermissions가 이미 이 키의 접근 판단을 전부 IAM 정책에 위임했으므로,
      # modules/iam/ecs.tf의 ecs_api_task_execution_ssm 정책(kms:Decrypt를 이 키
      # ARN으로 제한)만으로 충분하다. 예전에는 여기에도 그 role의 ARN을 문자열로 조립해
      # 넣었었는데, 그러면 이 키(aws_kms_key.api_secrets)와 module.iam(그 role을 만드는
      # 쪽) 사이에 Terraform이 아는 의존관계가 전혀 없어서 - 키 정책이 참조하는 role이
      # 아직 존재하지 않는 순서로 최초 apply가 실행되면 KMS가
      # MalformedPolicyDocumentException(존재하지 않는 principal)으로 키 생성 자체를
      # 거부할 수 있었다. 문을 없애면 그 경합도 함께 사라진다.
    ]
  })

  tags = { Name = "${var.project_name}-api-secrets" }
}

resource "aws_kms_alias" "api_secrets" {
  name          = "alias/${var.project_name}-api-secrets"
  target_key_id = aws_kms_key.api_secrets.key_id
}

resource "aws_ssm_parameter" "api_db_password" {
  name             = "${local.api_ssm_parameter_prefix}/db-password"
  type             = "SecureString"
  key_id           = aws_kms_key.api_secrets.key_id
  value_wo         = var.db_password
  value_wo_version = 1

  tags = { Name = "${var.project_name}-api-db-password" }
}

resource "aws_ssm_parameter" "api_admin_password" {
  name             = "${local.api_ssm_parameter_prefix}/admin-password"
  type             = "SecureString"
  key_id           = aws_kms_key.api_secrets.key_id
  value_wo         = var.admin_password
  value_wo_version = 1

  tags = { Name = "${var.project_name}-api-admin-password" }
}

resource "aws_ssm_parameter" "api_admin_jwt_secret" {
  name             = "${local.api_ssm_parameter_prefix}/admin-jwt-secret"
  type             = "SecureString"
  key_id           = aws_kms_key.api_secrets.key_id
  value_wo         = var.admin_jwt_secret
  value_wo_version = 1

  tags = { Name = "${var.project_name}-api-admin-jwt-secret" }
}

resource "aws_ssm_parameter" "api_user_jwt_secret" {
  name             = "${local.api_ssm_parameter_prefix}/user-jwt-secret"
  type             = "SecureString"
  key_id           = aws_kms_key.api_secrets.key_id
  value_wo         = var.user_jwt_secret
  value_wo_version = 1

  tags = { Name = "${var.project_name}-api-user-jwt-secret" }
}

resource "aws_ssm_parameter" "api_gpt_secret_key" {
  name             = "${local.api_ssm_parameter_prefix}/gpt-secret-key"
  type             = "SecureString"
  key_id           = aws_kms_key.api_secrets.key_id
  value_wo         = var.gpt_secret_key
  value_wo_version = 1

  tags = { Name = "${var.project_name}-api-gpt-secret-key" }
}

resource "aws_ssm_parameter" "api_internal_service_secret" {
  name             = "${local.api_ssm_parameter_prefix}/internal-service-secret"
  type             = "SecureString"
  key_id           = aws_kms_key.api_secrets.key_id
  value_wo         = var.internal_service_secret
  value_wo_version = 1

  tags = { Name = "${var.project_name}-api-internal-service-secret" }
}

# api_docs_password는 기본값이 ""(Swagger 인증 미사용)다 - SSM PutParameter는 Value가
# 빈 문자열이면 ValidationException으로 실패하므로, 값이 실제로 있을 때만 파라미터
# 자체를 만든다(count). 없으면 아래 api_secret_arns map에도 API_DOCS_PASSWORD 키를
# 넣지 않는다 - modules/ecs가 존재하지 않는 키를 컨테이너 secrets로 참조하지 않는다.
resource "aws_ssm_parameter" "api_docs_password" {
  count = var.api_docs_password != "" ? 1 : 0

  name             = "${local.api_ssm_parameter_prefix}/docs-password"
  type             = "SecureString"
  key_id           = aws_kms_key.api_secrets.key_id
  value_wo         = var.api_docs_password
  value_wo_version = 1

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

  # ECS Fargate 이관 4단계 - apps/game이 쓰는 시크릿은 apps/api와 값을 공유하는
  # USER_JWT_SECRET(방 참가 토큰 HMAC 키)/INTERNAL_SERVICE_SECRET(api<->game 내부 인증)
  # 둘뿐이다(ADR-0004). 별도 SSM 파라미터를 새로 만들지 않고 위 api_secret_arns가 참조하는
  # 파라미터를 그대로 재사용한다 - 두 서비스가 각자 다른 파라미터를 쓰면 로테이션 시 값이
  # 갈라질 위험이 생긴다.
  game_secret_arns = {
    USER_JWT_SECRET         = aws_ssm_parameter.api_user_jwt_secret.arn
    INTERNAL_SERVICE_SECRET = aws_ssm_parameter.api_internal_service_secret.arn
  }
}
