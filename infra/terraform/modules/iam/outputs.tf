output "instance_profile_name" {
  description = "app_a 인스턴스에 붙일 IAM 인스턴스 프로파일 이름"
  value       = aws_iam_instance_profile.app.name
}
