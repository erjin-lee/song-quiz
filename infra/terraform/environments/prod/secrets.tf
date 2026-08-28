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

locals {
  api_ssm_parameter_prefix = "/song-quiz/prod/api"
}

resource "aws_ssm_parameter" "api_db_password" {
  name  = "${local.api_ssm_parameter_prefix}/db-password"
  type  = "SecureString"
  value = var.db_password

  tags = { Name = "${var.project_name}-api-db-password" }
}

resource "aws_ssm_parameter" "api_admin_password" {
  name  = "${local.api_ssm_parameter_prefix}/admin-password"
  type  = "SecureString"
  value = var.admin_password

  tags = { Name = "${var.project_name}-api-admin-password" }
}

resource "aws_ssm_parameter" "api_admin_jwt_secret" {
  name  = "${local.api_ssm_parameter_prefix}/admin-jwt-secret"
  type  = "SecureString"
  value = var.admin_jwt_secret

  tags = { Name = "${var.project_name}-api-admin-jwt-secret" }
}

resource "aws_ssm_parameter" "api_user_jwt_secret" {
  name  = "${local.api_ssm_parameter_prefix}/user-jwt-secret"
  type  = "SecureString"
  value = var.user_jwt_secret

  tags = { Name = "${var.project_name}-api-user-jwt-secret" }
}

resource "aws_ssm_parameter" "api_gpt_secret_key" {
  name  = "${local.api_ssm_parameter_prefix}/gpt-secret-key"
  type  = "SecureString"
  value = var.gpt_secret_key

  tags = { Name = "${var.project_name}-api-gpt-secret-key" }
}

resource "aws_ssm_parameter" "api_internal_service_secret" {
  name  = "${local.api_ssm_parameter_prefix}/internal-service-secret"
  type  = "SecureString"
  value = var.internal_service_secret

  tags = { Name = "${var.project_name}-api-internal-service-secret" }
}

resource "aws_ssm_parameter" "api_docs_password" {
  name  = "${local.api_ssm_parameter_prefix}/docs-password"
  type  = "SecureString"
  value = var.api_docs_password

  tags = { Name = "${var.project_name}-api-docs-password" }
}

locals {
  # 이름은 컨테이너 환경변수 이름(apps/api가 process.env로 읽는 이름)과 정확히 같아야
  # 한다 - modules/ecs가 이 map을 그대로 ECS secrets 블록의 name으로 쓴다.
  api_secret_arns = {
    DB_PASSWORD             = aws_ssm_parameter.api_db_password.arn
    ADMIN_PASSWORD          = aws_ssm_parameter.api_admin_password.arn
    ADMIN_JWT_SECRET        = aws_ssm_parameter.api_admin_jwt_secret.arn
    USER_JWT_SECRET         = aws_ssm_parameter.api_user_jwt_secret.arn
    GPT_SECRET_KEY          = aws_ssm_parameter.api_gpt_secret_key.arn
    INTERNAL_SERVICE_SECRET = aws_ssm_parameter.api_internal_service_secret.arn
    API_DOCS_PASSWORD       = aws_ssm_parameter.api_docs_password.arn
  }
}
