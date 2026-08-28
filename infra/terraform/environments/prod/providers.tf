# default_tags: 이 provider로 생성되는 모든 리소스(태그를 지원하는 타입이면)에 자동으로
# 병합되는 태그. FinOps Cost Allocation Tag(Project/Environment/ManagedBy)를 리소스마다
# tags = {}에 반복해서 적지 않고 한 곳에서 관리하기 위해 도입했다 - 태그는 재생성 없이
# in-place로 갱신되는 속성이라, 기존 리소스에 새로 붙어도 destroy/recreate는 없다.
# 리소스별 tags에 이미 있는 키(Name, Service 등)는 그대로 유지되고 겹치지 않는 키만 병합된다
# (aws provider는 resource-level tags가 default_tags보다 우선한다).
#
# Project는 var.project_name을 그대로 쓰지 않는다 - var.project_name은 리소스 이름(S3 버킷,
# IAM Role 등)에 쓰이는 legacy 값 "deploy-terraform"(이 프로젝트가 SongQuiz로 이름을 바꾸기
# 전의 이름)이 실제 tfvars에 들어있고, 여기 쓰인 리소스들이 이 값으로 이름 붙어 있어 바꾸면
# 대량 리소스 재생성이 발생한다(테라폼 이름 변경 = 새 리소스). Cost Allocation Tag는 이름과
# 무관하게 "song-quiz"로 붙여야 하므로 리터럴로 분리한다.
provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile

  default_tags {
    tags = {
      Project     = "song-quiz"
      Environment = "prod"
      ManagedBy   = "terraform"
    }
  }
}

# CloudFront에 붙일 ACM 인증서는 반드시 us-east-1에 있어야 하므로 별도 alias를 둔다.
# default_tags도 리전 alias마다 독립적으로 선언해야 한다(provider 블록 단위 설정이라
# 상속되지 않음) - 위 기본 provider와 동일한 태그를 그대로 맞춘다.
provider "aws" {
  alias   = "us_east_1"
  region  = "us-east-1"
  profile = var.aws_profile

  default_tags {
    tags = {
      Project     = "song-quiz"
      Environment = "prod"
      ManagedBy   = "terraform"
    }
  }
}
