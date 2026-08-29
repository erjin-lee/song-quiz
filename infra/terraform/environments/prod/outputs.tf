output "vpc_id" {
  description = "생성된 VPC의 ID"
  value       = module.network.vpc_id
}

output "vpc_cidr_block" {
  description = "생성된 VPC의 CIDR 블록"
  value       = module.network.vpc_cidr_block
}

output "public_subnet_ids" {
  description = "퍼블릭 서브넷 ID 목록"
  value       = module.network.public_subnet_ids
}

output "private_app_subnet_ids" {
  description = "프라이빗 앱 서브넷 ID 목록"
  value       = module.network.private_app_subnet_ids
}

output "private_db_subnet_ids" {
  description = "프라이빗 DB 서브넷 ID 목록"
  value       = module.network.private_db_subnet_ids
}

output "internet_gateway_id" {
  description = "VPC에 연결된 Internet Gateway ID"
  value       = module.network.internet_gateway_id
}

output "public_security_group_id" {
  description = "Public 계층 보안 그룹 ID"
  value       = module.security.public_security_group_id
}

output "app_security_group_id" {
  description = "Private App 계층 보안 그룹 ID"
  value       = module.security.app_security_group_id
}

output "db_security_group_id" {
  description = "Private DB 계층 보안 그룹 ID"
  value       = module.security.db_security_group_id
}

output "bastion_public_ip" {
  description = "Bastion 인스턴스의 퍼블릭 IP (Elastic IP)"
  value       = module.compute.bastion_public_ip
}

output "bastion_ssh_command" {
  description = "Bastion 접속 SSH 명령어"
  value       = "ssh -i ~/.ssh/deploy-terraform-bastion ec2-user@${module.compute.bastion_public_ip}"
}

output "app_a_private_ip" {
  description = "앱 서버(app_a)의 프라이빗 IP"
  value       = module.compute.app_a_private_ip
}

output "db_endpoint" {
  description = "RDS 엔드포인트 (호스트:포트)"
  value       = module.database.endpoint
}

output "alb_dns_name" {
  description = "ALB의 DNS 이름"
  value       = module.load_balancer.dns_name
}

output "cache_endpoint" {
  description = "ElastiCache Redis 엔드포인트 (호스트:포트)"
  value       = module.cache.endpoint
}

output "nat_gateway_public_ip" {
  description = "NAT Gateway의 퍼블릭 IP"
  value       = module.network.nat_gateway_public_ip
}

output "api_domain" {
  description = "ALB에 연결된 API 도메인"
  value       = module.dns.api_domain
}

output "game_domain" {
  description = "ALB에 연결된 Game 서비스 도메인"
  value       = module.dns.game_domain
}

output "acm_certificate_arn" {
  description = "발급된 ACM 인증서 ARN"
  value       = module.acm.certificate_arn
}

output "web_bucket_name" {
  description = "웹 정적 파일을 올릴 S3 버킷 이름"
  value       = module.web.bucket_name
}

output "cloudfront_distribution_id" {
  description = "CloudFront 배포 ID (캐시 무효화 등에 사용)"
  value       = module.web.cloudfront_distribution_id
}

output "web_url" {
  description = "웹사이트 URL"
  value       = "https://${var.domain_name}"
}

output "ses_domain_identity_arn" {
  description = "SES 도메인 identity ARN (IAM 정책에서 발신 권한을 제한하는 데 사용)"
  value       = module.ses.domain_identity_arn
}

output "ses_domain_verified" {
  description = "SES 도메인 인증 완료 여부 (apply가 완료됐다면 항상 true)"
  value       = module.ses.domain_verified
}

output "api_log_group_name" {
  description = "apps/api PM2 로그용 CloudWatch Log Group 이름 (CloudWatch Agent 설정 파일에 사용)"
  value       = module.logging.api_log_group_name
}

output "game_log_group_name" {
  description = "apps/game PM2 로그용 CloudWatch Log Group 이름 (CloudWatch Agent 설정 파일에 사용)"
  value       = module.logging.game_log_group_name
}

output "cloudwatch_dashboard_url" {
  description = "운영 상태를 한 화면에서 보는 CloudWatch Dashboard 콘솔 URL"
  value       = "https://${var.aws_region}.console.aws.amazon.com/cloudwatch/home?region=${var.aws_region}#dashboards:name=${module.monitoring.dashboard_name}"
}

output "ecr_api_repository_url" {
  description = "apps/api ECR 리포지토리 URL - .github/workflows/publish-ecr.yml이 docker push할 대상"
  value       = module.ecr.api_repository_url
}

output "ecr_game_repository_url" {
  description = "apps/game ECR 리포지토리 URL - .github/workflows/publish-ecr.yml이 docker push할 대상"
  value       = module.ecr.game_repository_url
}

output "ecs_cluster_name" {
  description = "ECS 클러스터 이름 - aws ecs 콘솔/CLI 조회에 사용"
  value       = module.ecs.cluster_name
}

output "ecs_api_service_name" {
  description = "apps/api ECS 서비스 이름 - aws ecs describe-services 등에 사용"
  value       = module.ecs.api_service_name
}

output "api_current_traffic_target" {
  description = "지금 apply된 api_traffic_target 값(\"ec2\" 또는 \"ecs\") - ALB가 실제로 어디로 API 트래픽을 보내고 있는지 확인용"
  value       = var.api_traffic_target
}

output "ecs_game_service_name" {
  description = "apps/game ECS 서비스 이름 - aws ecs describe-services 등에 사용"
  value       = module.ecs.game_service_name
}

output "game_current_traffic_target" {
  description = "지금 apply된 game_traffic_target 값(\"ec2\" 또는 \"ecs\") - ALB가 실제로 어디로 Game 트래픽을 보내고 있는지 확인용"
  value       = var.game_traffic_target
}
