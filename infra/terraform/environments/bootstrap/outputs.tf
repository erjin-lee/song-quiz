output "state_bucket_name" {
  description = "Terraform state를 저장하는 S3 버킷 이름 - environments/prod/versions.tf의 backend.bucket에 이 값을 그대로 채운다"
  value       = aws_s3_bucket.terraform_state.bucket
}

output "ci_terraform_plan_role_arn" {
  description = "GitHub Actions가 assume할 IAM Role ARN - 워크플로우의 role-to-assume 및 리포지토리 설정(secret/variable)에 사용"
  value       = aws_iam_role.ci_terraform_plan.arn
}
