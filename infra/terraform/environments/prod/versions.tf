terraform {
  required_version = ">= 1.15.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # state는 environments/bootstrap에서 만든 S3 버킷에 저장한다.
  # 잠금(locking)은 별도 DynamoDB 없이 S3 네이티브 락(use_lockfile, TF 1.10+)을 사용해서,
  # 로컬에서든 CI에서든 동시에 plan/apply가 겹치면 한쪽이 락 오브젝트를 얻지 못해 대기/실패한다.
  backend "s3" {
    bucket       = "deploy-terraform-tfstate-840080484647"
    key          = "prod/terraform.tfstate"
    region       = "ap-northeast-2"
    use_lockfile = true
    encrypt      = true
  }
}
