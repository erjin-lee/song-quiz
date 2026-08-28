output "api_repository_url" {
  description = "apps/api ECR 리포지토리 URL (docker push/pull, 이후 ECS 태스크 정의 image에 사용)"
  value       = aws_ecr_repository.api.repository_url
}

output "api_repository_arn" {
  description = "apps/api ECR 리포지토리 ARN (IAM 정책 Resource에 사용)"
  value       = aws_ecr_repository.api.arn
}

output "game_repository_url" {
  description = "apps/game ECR 리포지토리 URL (docker push/pull, 이후 ECS 태스크 정의 image에 사용)"
  value       = aws_ecr_repository.game.repository_url
}

output "game_repository_arn" {
  description = "apps/game ECR 리포지토리 ARN (IAM 정책 Resource에 사용)"
  value       = aws_ecr_repository.game.arn
}
