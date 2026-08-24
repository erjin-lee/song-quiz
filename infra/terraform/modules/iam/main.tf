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

# EC2에 설치할 CloudWatch Agent가 PM2 stdout/stderr 로그를 로그 그룹으로 보낼 때 필요한 최소 권한.
# logging 모듈이 Log Group을 미리 만들어두므로 logs:CreateLogGroup은 필요 없고,
# 그 안에 로그 스트림을 만들고(CreateLogStream) 로그를 쓰는(PutLogEvents) 권한만 준다.
# DescribeLogStreams는 에이전트가 기존 스트림 존재 여부를 확인할 때 필요하다.
resource "aws_iam_role_policy" "app_cloudwatch_logs" {
  name = "${var.project_name}-app-cloudwatch-logs"
  role = aws_iam_role.app.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogStreams",
        ]
        Resource = [
          "${var.api_log_group_arn}:*",
          "${var.game_log_group_arn}:*",
        ]
      }
    ]
  })
}

# EC2에 설치된 CloudWatch Agent가 Memory/Disk 지표를 이 프로젝트 namespace로만 보낼 수 있게 하는 권한.
# cloudwatch:PutMetricData는 (로그와 달리) 리소스 수준 권한을 지원하지 않아 Resource는 "*"로 둘 수밖에
# 없다. 대신 cloudwatch:namespace 조건으로 이 프로젝트가 쓰는 namespace 밖으로는 지표를 못 보내게 제한한다.
resource "aws_iam_role_policy" "app_cloudwatch_metrics" {
  name = "${var.project_name}-app-cloudwatch-metrics"
  role = aws_iam_role.app.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "cloudwatch:PutMetricData"
        Resource = "*"
        Condition = {
          StringEquals = {
            "cloudwatch:namespace" = var.ec2_metric_namespace
          }
        }
      }
    ]
  })
}

# EC2에 설치된 CloudWatch Agent가 OTLP로 수신한 trace를 X-Ray로 전송할 때 필요한 최소 권한.
# xray:PutTraceSegments/PutTelemetryRecords는 (cloudwatch:PutMetricData와 마찬가지로) 리소스
# 수준 권한을 지원하지 않는 액션이라 Resource가 "*"일 수밖에 없다 - X-Ray에는 cloudwatch의
# namespace 조건 같은 대체 제한 수단도 없어, 이 두 액션만 허용하고 그 외 X-Ray 권한(조회,
# 샘플링 규칙 등)은 주지 않는 것으로 범위를 최소화한다.
resource "aws_iam_role_policy" "app_xray_write" {
  name = "${var.project_name}-app-xray-write"
  role = aws_iam_role.app.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "xray:PutTraceSegments",
          "xray:PutTelemetryRecords",
        ]
        Resource = "*"
      }
    ]
  })
}

# EC2는 IAM 역할을 직접 참조할 수 없고, 인스턴스 프로파일을 통해서만 역할을 맡을 수 있다.
resource "aws_iam_instance_profile" "app" {
  name = "${var.project_name}-app"
  role = aws_iam_role.app.name
}
