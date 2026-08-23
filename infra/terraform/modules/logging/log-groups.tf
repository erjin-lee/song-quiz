# app_a 인스턴스에 설치할 CloudWatch Agent가 PM2 stdout/stderr 로그를 보낼 CloudWatch Log Group.
# 에이전트 설치/설정(agent config, 어떤 로그 파일을 어떤 스트림으로 보낼지)은 EC2에서 수동으로 진행하고,
# 여기서는 로그가 도착할 그릇(Log Group)과 거기에 쓸 수 있는 IAM 권한(iam 모듈)만 Terraform으로 관리한다.
resource "aws_cloudwatch_log_group" "api" {
  name              = "/${var.project_name}/api"
  retention_in_days = var.log_retention_days

  tags = {
    Name = "${var.project_name}-api-logs"
  }
}

resource "aws_cloudwatch_log_group" "game" {
  name              = "/${var.project_name}/game"
  retention_in_days = var.log_retention_days

  tags = {
    Name = "${var.project_name}-game-logs"
  }
}
