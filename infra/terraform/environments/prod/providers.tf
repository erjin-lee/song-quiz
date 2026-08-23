provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile
}

# CloudFront에 붙일 ACM 인증서는 반드시 us-east-1에 있어야 하므로 별도 alias를 둔다.
provider "aws" {
  alias   = "us_east_1"
  region  = "us-east-1"
  profile = var.aws_profile
}
