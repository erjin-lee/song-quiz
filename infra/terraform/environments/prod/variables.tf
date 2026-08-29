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

variable "api_db_schema_name" {
  description = "apps/api ECS 태스크의 DB_AUTH_DB_NAME 환경변수(TypeORM이 실제로 연결할 스키마 이름) - var.db_name과는 다른 값이다. var.db_name은 RDS 인스턴스 생성 시점에만 쓰이는 초기 스키마 이름(실사용 안 함, 현재 RDS에서는 비어있는 \"appdb\")이고, 실제 애플리케이션 테이블(SQ_USER 등)은 별도로 만들어진 \"song_quiz\" 스키마에 있다(2026-08-29, bastion 터널로 직접 확인) - var.db_name을 바꾸면 aws_db_instance의 db_name이 ForceNew라 RDS가 재생성될 위험이 있어 별도 변수로 완전히 분리한다"
  type        = string
  default     = "song_quiz"
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

# --- ECS Fargate 이관 2단계 (docs/infra/ecs-fargate-migration-plan.md) ---
# apps/api를 ECS Fargate로 옮기며 EC2(WAS)의 .env 파일이 하던 역할을 대신한다.
# 아래 시크릿 변수들은 지금 app_a EC2의 .env에 이미 들어있는 값과 정확히 같아야 한다 -
# 특히 USER_JWT_SECRET/INTERNAL_SERVICE_SECRET은 apps/game(EC2, 아직 이관 전)과
# 공유하는 값이라(ADR-0004), 여기서 새로 생성한 값을 넣으면 로그인 세션이 전부
# 무효화되거나 game<->api 내부 호출이 401로 깨진다. 반드시 기존 값을 그대로 옮긴다.

variable "admin_user" {
  description = "관리자 계정 시딩(AdminSeedService)에 쓰는 사용자명. 기본값 없음 - 기존 .env 값과 동일하게 맞출 것"
  type        = string
}

variable "admin_password" {
  description = "관리자 계정 시딩 비밀번호. 기본값 없음 - 기존 .env 값과 동일하게 맞출 것"
  type        = string
  sensitive   = true
}

variable "admin_jwt_secret" {
  description = "Admin JWT 서명 시크릿. 기본값 없음 - 기존 .env 값과 정확히 동일해야 한다(다르면 기존 관리자 세션이 전부 무효화됨)"
  type        = string
  sensitive   = true
}

variable "user_jwt_secret" {
  description = "User JWT 서명 시크릿 - apps/game과 공유하는 값(ADR-0004, 방 참가 토큰 HMAC 키). 기본값 없음 - 기존 .env 값과 정확히 동일해야 한다"
  type        = string
  sensitive   = true
}

variable "gpt_secret_key" {
  description = "OpenAI API 키(GPT 정답 채점, 문의 자동 응답). 기본값 없음"
  type        = string
  sensitive   = true
}

variable "internal_service_secret" {
  description = "apps/api<->apps/game 내부 엔드포인트 인증 시크릿(X-Internal-Secret) - apps/game과 공유하는 값. 기본값 없음 - 기존 .env 값과 정확히 동일해야 한다"
  type        = string
  sensitive   = true
}

variable "api_docs_user" {
  description = "Swagger(/api-docs) Basic Auth 사용자명. 비워두면(기본값) Swagger 문서가 인증 없이 열린다 - API_DOCS_USER/PASSWORD는 둘 다 설정하거나 둘 다 비워야 한다(app.ts 검증)"
  type        = string
  default     = ""
}

variable "api_docs_password" {
  description = "Swagger(/api-docs) Basic Auth 비밀번호. api_docs_user와 짝을 맞춘다"
  type        = string
  sensitive   = true
  default     = ""
}

variable "mail_from_address" {
  description = "SES로 발신할 때 쓰는 From 주소 - SES에서 검증된 도메인/주소여야 한다. 기본값 없음"
  type        = string
}

variable "api_image_git_sha" {
  description = "ECS에 배포할 apps/api 이미지의 git commit SHA - publish-ecr.yml이 push한 sha-<이 값> 태그를 그대로 참조한다. 기본값 없음 - 매번 배포할 커밋으로 갱신할 것"
  type        = string
}

variable "api_traffic_target" {
  description = "ALB가 API 트래픽을 보낼 대상. \"ec2\"(app_a, 기존/기본값) 또는 \"ecs\"(Fargate). ECS 서비스가 healthy한 것을 확인한 뒤에만 \"ecs\"로 바꾼다 - 문제가 생기면 다시 \"ec2\"로 돌리면 즉시 롤백된다"
  type        = string
  default     = "ec2"
}

variable "api_task_cpu" {
  description = "apps/api Fargate 태스크의 CPU 유닛(1024 = 1 vCPU) - 3단계에서 ADOT Collector 사이드카 몫까지 포함하도록 256에서 512로 올렸다"
  type        = string
  default     = "512"
}

variable "api_task_memory" {
  description = "apps/api Fargate 태스크의 메모리(MiB) - 3단계에서 ADOT Collector 사이드카 몫까지 포함하도록 512에서 1024로 올렸다"
  type        = string
  default     = "1024"
}

variable "api_desired_count" {
  description = "apps/api ECS 서비스가 유지할 태스크 개수"
  type        = number
  default     = 1
}
