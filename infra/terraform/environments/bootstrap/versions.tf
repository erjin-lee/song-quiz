terraform {
  required_version = ">= 1.15.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # 이 구성은 의도적으로 backend를 지정하지 않는다(기본값 = local).
  # environments/prod의 state를 저장할 S3 버킷 자체를 여기서 만들기 때문에,
  # 그 버킷을 가리키는 원격 backend를 이 구성에도 쓰면 "버킷이 있어야 버킷을 만들 수 있는"
  # 순환(닭과 달걀) 문제가 생긴다. 부트스트랩은 로컬 state로 딱 한 번 apply하고 끝내는 용도다.
}
