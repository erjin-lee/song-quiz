output "instance_profile_name" {
  description = "app_a 인스턴스에 붙일 IAM 인스턴스 프로파일 이름"
  value       = aws_iam_instance_profile.app.name
}

output "ec2_metric_namespace" {
  description = "CloudWatch Agent가 EC2 Memory/Disk 지표를 보내는 namespace (monitoring 모듈의 Dashboard가 참조 - IAM 정책의 namespace 조건과 값이 갈라지지 않도록 여기서만 정의)"
  value       = var.ec2_metric_namespace
}

output "ecs_api_task_execution_role_arn" {
  description = "apps/api ECS 태스크 정의의 execution_role_arn에 쓸 IAM Role ARN"
  value       = aws_iam_role.ecs_api_task_execution.arn
}

output "ecs_api_task_role_arn" {
  description = "apps/api ECS 태스크 정의의 task_role_arn에 쓸 IAM Role ARN"
  value       = aws_iam_role.ecs_api_task.arn
}

output "ecs_game_task_execution_role_arn" {
  description = "apps/game ECS 태스크 정의의 execution_role_arn에 쓸 IAM Role ARN"
  value       = aws_iam_role.ecs_game_task_execution.arn
}
