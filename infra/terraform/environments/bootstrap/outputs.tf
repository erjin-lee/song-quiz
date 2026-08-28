output "state_bucket_name" {
  description = "Terraform state를 저장하는 S3 버킷 이름 - environments/prod/versions.tf의 backend.bucket에 이 값을 그대로 채운다"
  value       = aws_s3_bucket.terraform_state.bucket
}

output "ci_terraform_plan_role_arn" {
  description = "GitHub Actions가 assume할 IAM Role ARN - 워크플로우의 role-to-assume 및 리포지토리 설정(secret/variable)에 사용"
  value       = aws_iam_role.ci_terraform_plan.arn
}

output "ci_deploy_metadata_role_arn" {
  description = "deploy-api.yml/deploy-game.yml이 Deployment Metadata를 SSM에 기록할 때 assume할 IAM Role ARN - 리포지토리 변수(CI_DEPLOY_METADATA_ROLE_ARN)에 이 값을 등록한다"
  value       = aws_iam_role.ci_deploy_metadata.arn
}

output "ci_deploy_lambda_role_arn" {
  description = "deploy-alarm-notifier.yml/deploy-incident-analyzer.yml이 Lambda 코드만 업데이트할 때 assume할 IAM Role ARN - 리포지토리 변수(CI_DEPLOY_LAMBDA_ROLE_ARN)에 이 값을 등록한다"
  value       = aws_iam_role.ci_deploy_lambda.arn
}

output "ci_ecr_push_role_arn" {
  description = ".github/workflows/publish-ecr.yml이 ECR에 이미지를 push할 때 assume할 IAM Role ARN - 리포지토리 변수(CI_ECR_PUSH_ROLE_ARN)에 이 값을 등록한다"
  value       = aws_iam_role.ci_ecr_push.arn
}
