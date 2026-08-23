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
