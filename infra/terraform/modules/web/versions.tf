# CloudFront용 인증서는 us-east-1에서만 발급되므로, 이 모듈은 기본 리전 provider와
# us-east-1 alias provider를 모두 받는다. 호출부(environments/prod/main.tf)에서
# providers = { aws = aws, aws.us_east_1 = aws.us_east_1 } 로 명시적으로 전달해야 한다.
terraform {
  required_providers {
    aws = {
      source                = "hashicorp/aws"
      configuration_aliases = [aws.us_east_1]
    }
  }
}
