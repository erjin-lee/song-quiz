output "dns_name" {
  description = "ALB의 DNS 이름"
  value       = aws_lb.main.dns_name
}

output "zone_id" {
  description = "ALB의 Route53 호스팅 영역 ID (alias 레코드 생성용)"
  value       = aws_lb.main.zone_id
}

output "arn" {
  description = "ALB의 ARN"
  value       = aws_lb.main.arn
}

output "arn_suffix" {
  description = "ALB의 arn_suffix (CloudWatch AWS/ApplicationELB 지표의 LoadBalancer dimension 값)"
  value       = aws_lb.main.arn_suffix
}

output "app_target_group_arn_suffix" {
  description = "apps/api 타겟그룹의 arn_suffix (CloudWatch AWS/ApplicationELB 지표의 TargetGroup dimension 값)"
  value       = aws_lb_target_group.app.arn_suffix
}

output "game_target_group_arn_suffix" {
  description = "apps/game 타겟그룹의 arn_suffix (CloudWatch AWS/ApplicationELB 지표의 TargetGroup dimension 값)"
  value       = aws_lb_target_group.game.arn_suffix
}

output "app_ecs_target_group_arn" {
  description = "apps/api ECS Fargate 태스크용 타겟그룹 ARN (ecs 모듈의 aws_ecs_service load_balancer 블록에 사용)"
  value       = aws_lb_target_group.app_ecs.arn
}

output "app_ecs_target_group_arn_suffix" {
  description = "apps/api ECS Fargate 태스크용 타겟그룹의 arn_suffix (CloudWatch AWS/ApplicationELB 지표의 TargetGroup dimension 값)"
  value       = aws_lb_target_group.app_ecs.arn_suffix
}
