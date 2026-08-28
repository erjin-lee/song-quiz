output "endpoint" {
  description = "ElastiCache Redis 엔드포인트 (호스트:포트)"
  value       = "${aws_elasticache_cluster.main.cache_nodes[0].address}:${aws_elasticache_cluster.main.cache_nodes[0].port}"
}

output "address" {
  description = "ElastiCache Redis 호스트만(포트 제외) - ECS 태스크의 REDIS_HOST 환경변수처럼 호스트/포트를 분리해서 넘겨야 하는 곳에 쓴다"
  value       = aws_elasticache_cluster.main.cache_nodes[0].address
}

output "cluster_id" {
  description = "ElastiCache 클러스터 ID (CloudWatch AWS/ElastiCache 지표의 CacheClusterId dimension 값)"
  value       = aws_elasticache_cluster.main.cluster_id
}
