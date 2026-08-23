variable "project_name" {
  description = "리소스 이름/태그에 사용할 프로젝트 식별자"
  type        = string
}

variable "vpc_cidr" {
  description = "VPC에 할당할 IPv4 CIDR 블록"
  type        = string
}

variable "availability_zones" {
  description = "서브넷을 배치할 가용영역 목록 (앞에서부터 순서대로 사용)"
  type        = list(string)
}
