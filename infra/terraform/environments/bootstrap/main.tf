data "aws_caller_identity" "current" {}

locals {
  # S3 버킷 이름은 리전이 아니라 AWS 전체에서 유일해야 한다. project_name만 쓰면 다른 계정이
  # 먼저 선점했을 때 충돌할 수 있으므로, 이 계정 안에서는 항상 유일한 계정 ID를 붙인다.
  state_bucket_name = "${var.project_name}-tfstate-${data.aws_caller_identity.current.account_id}"
}

# Terraform state를 저장할 S3 버킷.
resource "aws_s3_bucket" "terraform_state" {
  bucket = local.state_bucket_name

  tags = {
    Name = local.state_bucket_name
  }
}

# state 파일에는 리소스 속성(RDS 비밀번호 등 sensitive 값 포함)이 평문으로 남을 수 있어
# 버킷을 반드시 private로 잠근다.
resource "aws_s3_bucket_public_access_block" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ACL 대신 버킷 정책/IAM만으로 접근을 제어하도록 강제한다 (현재 AWS가 권장하는 방식).
resource "aws_s3_bucket_ownership_controls" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

# 저장 데이터 암호화(SSE-S3). state에 sensitive 값이 들어갈 수 있으므로 기본 암호화를 강제한다.
resource "aws_s3_bucket_server_side_encryption_configuration" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

# 버전 관리를 켜야 state가 실수로 덮어써지거나 손상됐을 때 이전 버전으로 복구할 수 있다.
# (동시 apply 충돌 자체를 막는 건 버전 관리가 아니라 backend의 use_lockfile 락이 하는 일이다.)
resource "aws_s3_bucket_versioning" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  versioning_configuration {
    status = "Enabled"
  }
}

# 오래된 state 버전이 무한히 쌓여 비용이 늘지 않도록 90일 뒤 만료한다.
# 현재 버전(최신 state)은 만료 대상이 아니고, 과거 버전만 정리된다.
resource "aws_s3_bucket_lifecycle_configuration" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  rule {
    id     = "expire-old-state-versions"
    status = "Enabled"

    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }

  depends_on = [aws_s3_bucket_versioning.terraform_state]
}
