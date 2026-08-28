output "endpoint" {
  description = "RDS 엔드포인트 (호스트:포트)"
  value       = aws_db_instance.main.endpoint
}

output "address" {
  description = "RDS 호스트만(포트 제외) - ECS 태스크의 DB_HOST_NAME 환경변수처럼 호스트/포트를 분리해서 넘겨야 하는 곳에 쓴다"
  value       = aws_db_instance.main.address
}

output "identifier" {
  description = "RDS 인스턴스 식별자 (CloudWatch AWS/RDS 지표의 DBInstanceIdentifier dimension 값)"
  value       = aws_db_instance.main.identifier
}
