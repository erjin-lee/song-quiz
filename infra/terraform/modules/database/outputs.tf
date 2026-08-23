output "endpoint" {
  description = "RDS 엔드포인트 (호스트:포트)"
  value       = aws_db_instance.main.endpoint
}

output "identifier" {
  description = "RDS 인스턴스 식별자 (CloudWatch AWS/RDS 지표의 DBInstanceIdentifier dimension 값)"
  value       = aws_db_instance.main.identifier
}
