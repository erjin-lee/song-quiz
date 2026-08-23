# app_a 인스턴스가 AWS 리소스(SES 등)에 접근할 때 맡을 역할. 원래 루트의 iam.tf 그대로다.
# 액세스 키를 인스턴스에 하드코딩하지 않고, EC2가 이 역할을 통해 임시 자격증명을
# 자동으로 받아 쓰도록 하기 위함 (IAM 역할이 필요한 이유).
resource "aws_iam_role" "app" {
  name = "${var.project_name}-app"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-app"
  }
}

# SES 발신 권한을 이 프로젝트에서 인증한 도메인 identity로만 제한한다 (최소 권한 원칙).
resource "aws_iam_role_policy" "app_ses_send" {
  name = "${var.project_name}-app-ses-send"
  role = aws_iam_role.app.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["ses:SendEmail", "ses:SendRawEmail"]
        Resource = var.ses_domain_identity_arn
      }
    ]
  })
}

# EC2는 IAM 역할을 직접 참조할 수 없고, 인스턴스 프로파일을 통해서만 역할을 맡을 수 있다.
resource "aws_iam_instance_profile" "app" {
  name = "${var.project_name}-app"
  role = aws_iam_role.app.name
}
