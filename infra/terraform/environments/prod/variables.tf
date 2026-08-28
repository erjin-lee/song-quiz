variable "aws_region" {
  description = "리소스를 생성할 AWS 리전"
  type        = string
  default     = "ap-northeast-2"
}

variable "aws_profile" {
  description = "인증에 사용할 AWS CLI 프로필 이름"
  type        = string
  default     = "default"
}

variable "project_name" {
  description = "리소스 이름/태그에 사용할 프로젝트 식별자"
  type        = string
  default     = "deploy-terraform"
}

variable "vpc_cidr" {
  description = "VPC에 할당할 IPv4 CIDR 블록"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "서브넷을 배치할 가용영역 목록 (앞에서부터 순서대로 사용)"
  type        = list(string)
  default     = ["ap-northeast-2a", "ap-northeast-2c"]
}

variable "app_port" {
  description = "apps/api(일반 REST) 서버가 사용하는 포트"
  type        = number
  default     = 8001
}

variable "game_port" {
  description = "apps/game(room + Socket.IO) 서버가 사용하는 포트"
  type        = number
  default     = 8002
}

variable "db_port" {
  description = "데이터베이스가 사용하는 포트 (MySQL/MariaDB 기본값)"
  type        = number
  default     = 3306
}

variable "bastion_public_key_path" {
  description = "Bastion 인스턴스에 등록할 SSH 공개키 파일 경로"
  type        = string
  default     = "~/.ssh/deploy-terraform-bastion.pub"
}

variable "bastion_instance_type" {
  description = "Bastion 인스턴스 타입"
  type        = string
  default     = "t3.micro"
}

variable "app_instance_type" {
  description = "앱 서버 인스턴스 타입"
  type        = string
  default     = "t3.micro"
}

variable "db_engine_version" {
  description = "RDS MySQL 엔진 버전"
  type        = string
  default     = "8.4"
}

variable "db_instance_class" {
  description = "RDS 인스턴스 클래스"
  type        = string
  default     = "db.t3.micro"
}

variable "db_allocated_storage" {
  description = "RDS 스토리지 크기(GB)"
  type        = number
  default     = 20
}

variable "db_name" {
  description = "생성할 데이터베이스(스키마) 이름"
  type        = string
  default     = "appdb"
}

variable "db_username" {
  description = "RDS 마스터 사용자명"
  type        = string
  default     = "dbadmin"
}

variable "db_password" {
  description = "RDS 마스터 비밀번호. 기본값 없음 - terraform.tfvars 또는 TF_VAR_db_password 환경변수로 직접 지정할 것"
  type        = string
  sensitive   = true
}

variable "db_multi_az" {
  description = "RDS Multi-AZ(대기 복본) 활성화 여부"
  type        = bool
  default     = false
}

variable "db_deletion_protection" {
  description = "RDS 삭제 보호 활성화 여부"
  type        = bool
  default     = true
}

variable "alb_health_check_path" {
  description = "ALB 타겟그룹 헬스체크 경로"
  type        = string
  default     = "/health"
}

variable "cache_engine_version" {
  description = "ElastiCache Redis 엔진 버전"
  type        = string
  default     = "7.1"
}

variable "cache_node_type" {
  description = "ElastiCache 노드 타입"
  type        = string
  default     = "cache.t4g.micro"
}

variable "cache_port" {
  description = "Redis 포트"
  type        = number
  default     = 6379
}

variable "domain_name" {
  description = "Route53에 이미 만들어진 호스팅 영역 도메인"
  type        = string
  default     = "noraemat.site"
}

variable "api_subdomain" {
  description = "ALB를 연결할 서브도메인 (apps/api)"
  type        = string
  default     = "api"
}

variable "game_subdomain" {
  description = "ALB를 연결할 서브도메인 (apps/game)"
  type        = string
  default     = "game"
}

# --- FinOps (modules/finops, modules/cost-reporter) ---

variable "monthly_budget_usd" {
  description = "월간 AWS 비용 Budget 금액(USD). 기본값 없음 - terraform.tfvars 또는 TF_VAR_monthly_budget_usd로 직접 지정할 것."
  type        = number
}

variable "budget_alert_emails" {
  description = "Budget/Cost Anomaly Detection 알림을 받을 이메일 주소 목록. 민감한 환경별 값이라 기본값을 두지 않는다 - terraform.tfvars(gitignore 대상) 또는 TF_VAR_budget_alert_emails로 지정할 것."
  type        = list(string)
  sensitive   = true
}

variable "cost_anomaly_threshold_usd" {
  description = "Cost Anomaly Detection이 알림을 보낼 이상 비용 절대값 임계치(USD)"
  type        = number
  default     = 10
}
