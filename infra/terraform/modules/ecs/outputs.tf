output "cluster_name" {
  description = "ECS 클러스터 이름"
  value       = aws_ecs_cluster.main.name
}

output "api_service_name" {
  description = "apps/api ECS 서비스 이름"
  value       = aws_ecs_service.api.name
}

output "api_task_definition_family" {
  description = "apps/api ECS 태스크 정의 family (새 리비전을 등록할 때 참조)"
  value       = aws_ecs_task_definition.api.family
}

output "game_service_name" {
  description = "apps/game ECS 서비스 이름"
  value       = aws_ecs_service.game.name
}

output "game_task_definition_family" {
  description = "apps/game ECS 태스크 정의 family (새 리비전을 등록할 때 참조)"
  value       = aws_ecs_task_definition.game.family
}
