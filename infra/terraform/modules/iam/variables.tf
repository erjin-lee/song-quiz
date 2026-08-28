variable "project_name" {
  description = "리소스 이름/태그에 사용할 프로젝트 식별자"
  type        = string
}

variable "ses_domain_identity_arn" {
  description = "SES 발신 권한을 제한할 도메인 identity ARN (ses 모듈 출력)"
  type        = string
}

variable "api_log_group_arn" {
  description = "CloudWatch Agent 쓰기 권한을 제한할 apps/api Log Group ARN (logging 모듈 출력)"
  type        = string
}

variable "game_log_group_arn" {
  description = "CloudWatch Agent 쓰기 권한을 제한할 apps/game Log Group ARN (logging 모듈 출력)"
  type        = string
}

variable "ec2_metric_namespace" {
  description = "CloudWatch Agent가 EC2 Memory/Disk 지표를 보낼 namespace. environments/prod/cloudwatch-agent/amazon-cloudwatch-agent.json의 metrics.namespace와 반드시 같은 값이어야 한다"
  type        = string
  default     = "SongQuiz/EC2"
}

variable "aws_region" {
  description = "kms:Decrypt Resource(alias/aws/ssm) ARN을 구성할 때 쓰는 리전 (ECS Fargate 이관 2단계)"
  type        = string
}

variable "ecr_api_repository_arn" {
  description = "ECS Task Execution Role의 이미지 pull 권한을 제한할 apps/api ECR 리포지토리 ARN (ecr 모듈 출력)"
  type        = string
}

variable "ecs_api_secret_arns" {
  description = "ECS Task Execution Role의 ssm:GetParameters 권한을 제한할 apps/api SSM Parameter Store(SecureString) ARN 목록 (environments/prod/secrets.tf 출력)"
  type        = list(string)
}
