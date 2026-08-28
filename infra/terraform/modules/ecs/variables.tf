variable "project_name" {
  description = "리소스 이름에 사용할 프로젝트 식별자"
  type        = string
}

variable "aws_region" {
  description = "awslogs 드라이버의 awslogs-region 옵션에 쓰는 리전"
  type        = string
}

variable "public_subnet_ids" {
  description = "ECS 태스크를 배치할 퍼블릭 서브넷 ID 목록 (network 모듈 출력)"
  type        = list(string)
}

variable "ecs_api_security_group_id" {
  description = "ECS 태스크에 붙일 보안 그룹 ID (security 모듈 출력)"
  type        = string
}

variable "api_target_group_arn" {
  description = "ECS 서비스가 등록될 ALB 타겟그룹 ARN (load_balancer 모듈의 app_ecs 출력)"
  type        = string
}

variable "execution_role_arn" {
  description = "ECS Task Execution Role ARN (iam 모듈 출력)"
  type        = string
}

variable "task_role_arn" {
  description = "ECS Task Role ARN (iam 모듈 출력)"
  type        = string
}

variable "api_repository_url" {
  description = "apps/api ECR 리포지토리 URL (ecr 모듈 출력)"
  type        = string
}

variable "api_image_git_sha" {
  description = "배포할 이미지의 git commit SHA. ECR 태그는 publish-ecr.yml이 \"sha-<GITHUB_SHA>\" 형식으로 push하므로, 이 값 앞에 이 모듈이 \"sha-\"를 붙여 이미지를 참조한다"
  type        = string
}

variable "api_log_group_name" {
  description = "awslogs 드라이버가 쓸 CloudWatch Log Group 이름 (logging 모듈 출력, 기존 apps/api Log Group을 그대로 재사용)"
  type        = string
}

variable "app_port" {
  description = "apps/api(일반 REST) 서버가 사용하는 포트"
  type        = number
}

variable "api_task_cpu" {
  description = "apps/api 태스크의 Fargate CPU 유닛(1024 = 1 vCPU)"
  type        = string
  default     = "256"
}

variable "api_task_memory" {
  description = "apps/api 태스크의 Fargate 메모리(MiB)"
  type        = string
  default     = "512"
}

variable "api_desired_count" {
  description = "apps/api ECS 서비스가 유지할 태스크 개수 (Auto Scaling은 6단계에서 추가 - 그 전까지는 고정값)"
  type        = number
  default     = 1
}

variable "api_health_check_grace_period_seconds" {
  description = "ECS 서비스가 새 태스크의 ALB readiness 체크 실패를 무시해주는 유예 시간(초) - 컨테이너 시작 후 DB/Redis 연결이 자리잡을 시간을 준다"
  type        = number
  default     = 60
}

variable "environment_variables" {
  description = "apps/api 컨테이너에 평문으로 주입할 환경변수 (name => value). 시크릿은 secret_arns를 쓴다"
  type        = map(string)
}

variable "secret_arns" {
  description = "apps/api 컨테이너에 SSM Parameter Store에서 복호화해 주입할 환경변수 (name => Parameter ARN)"
  type        = map(string)
}
