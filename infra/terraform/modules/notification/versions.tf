# Lambda 배포 zip을 만드는 data "archive_file"이 이 모듈에서만 필요하므로, archive provider
# 요구사항도 이 모듈에 둔다(web 모듈이 us-east-1 aws provider alias를 자기 모듈에 선언해둔 것과
# 같은 패턴). archive는 별도 인증/설정이 필요 없는 local-only provider라 환경(environments/prod)에서
# providers = {}로 넘겨줄 필요 없이 암묵적으로 기본 설정을 사용한다.
terraform {
  required_providers {
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
  }
}
