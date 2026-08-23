output "endpoint" {
  description = "ElastiCache Redis 엔드포인트 (호스트:포트)"
  value       = "${aws_elasticache_cluster.main.cache_nodes[0].address}:${aws_elasticache_cluster.main.cache_nodes[0].port}"
}
