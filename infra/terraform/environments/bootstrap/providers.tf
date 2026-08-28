# default_tags: environments/prod/providers.tf와 같은 이유(Cost Allocation Tag를 리소스마다
# 반복하지 않고 한 곳에서 관리). 이 root는 상태 버킷/CI OIDC Role처럼 특정 런타임 환경에
# 속하지 않는 관리용 리소스라 Environment는 "prod"가 아니라 "shared"로 둔다.
provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile

  default_tags {
    tags = {
      Project     = "song-quiz"
      Environment = "shared"
      ManagedBy   = "terraform"
    }
  }
}
