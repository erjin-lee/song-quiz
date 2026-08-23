output "endpoint" {
  description = "RDS 엔드포인트 (호스트:포트)"
  value       = aws_db_instance.main.endpoint
}
