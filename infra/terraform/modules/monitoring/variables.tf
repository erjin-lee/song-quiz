variable "dashboard_name" {
  description = "CloudWatch Dashboard 이름"
  type        = string
  default     = "SongQuiz-Prod"
}

variable "aws_region" {
  description = "Dashboard의 각 Widget이 조회할 AWS 리전"
  type        = string
}

variable "alb_arn_suffix" {
  description = "ALB의 arn_suffix (load_balancer 모듈 출력, AWS/ApplicationELB 지표의 LoadBalancer dimension)"
  type        = string
}

variable "api_target_group_arn_suffix" {
  description = "apps/api 타겟그룹의 arn_suffix (load_balancer 모듈 출력, TargetGroup dimension)"
  type        = string
}

variable "game_target_group_arn_suffix" {
  description = "apps/game 타겟그룹의 arn_suffix (load_balancer 모듈 출력, TargetGroup dimension)"
  type        = string
}

variable "app_instance_id" {
  description = "app_a EC2 인스턴스 ID (compute 모듈 출력, AWS/EC2 및 SongQuiz/EC2 지표의 InstanceId dimension)"
  type        = string
}

variable "db_instance_identifier" {
  description = "RDS 인스턴스 식별자 (database 모듈 출력, AWS/RDS 지표의 DBInstanceIdentifier dimension)"
  type        = string
}

variable "cache_cluster_id" {
  description = "ElastiCache 클러스터 ID (cache 모듈 출력, AWS/ElastiCache 지표의 CacheClusterId dimension)"
  type        = string
}

variable "game_metric_namespace" {
  description = "Game 실패 이벤트 Metric Filter의 namespace (logging 모듈 출력)"
  type        = string
}

variable "ec2_metric_namespace" {
  description = "CloudWatch Agent EC2 Memory/Disk 지표의 namespace (iam 모듈 출력)"
  type        = string
}
