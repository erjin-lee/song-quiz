# modules/notification/versions.tf와 동일한 이유로 archive provider 요구사항을 이 모듈에
# 둔다 - Lambda 배포 zip을 만드는 data "archive_file"이 이 모듈에서만 필요하다.
terraform {
  required_providers {
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
  }
}
