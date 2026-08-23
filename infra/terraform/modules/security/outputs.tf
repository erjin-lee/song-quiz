output "public_security_group_id" {
  description = "Public 계층 보안 그룹 ID"
  value       = aws_security_group.public.id
}

output "app_security_group_id" {
  description = "Private App 계층 보안 그룹 ID"
  value       = aws_security_group.app.id
}

output "db_security_group_id" {
  description = "Private DB 계층 보안 그룹 ID"
  value       = aws_security_group.db.id
}
