output "endpoint" {
  description = "ElastiCache Redis 엔드포인트 (호스트:포트)"
  value       = "${aws_elasticache_cluster.main.cache_nodes[0].address}:${aws_elasticache_cluster.main.cache_nodes[0].port}"
}

output "cluster_id" {
  description = "ElastiCache 클러스터 ID (CloudWatch AWS/ElastiCache 지표의 CacheClusterId dimension 값)"
  value       = aws_elasticache_cluster.main.cluster_id
}
