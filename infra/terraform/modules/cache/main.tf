# ElastiCache(Redis). 원래 루트의 cache.tf 그대로다.

resource "aws_elasticache_subnet_group" "main" {
  name       = "${var.project_name}-cache"
  subnet_ids = var.private_db_subnet_ids
}

resource "aws_security_group" "cache" {
  name        = "${var.project_name}-cache"
  description = "Security group for ElastiCache Redis"
  vpc_id      = var.vpc_id

  ingress {
    description     = "Redis from app tier"
    from_port       = var.cache_port
    to_port         = var.cache_port
    protocol        = "tcp"
    security_groups = [var.app_security_group_id]
  }

  # ECS Fargate 이관 2단계 - apps/api Fargate 태스크도 room 스냅샷 캐시 등에 Redis를
  # 쓴다. game(app SG, 위 규칙)이 room 상태의 주 사용자라 그 규칙은 그대로 두고 추가한다.
  ingress {
    description     = "Redis from ecs_api tier"
    from_port       = var.cache_port
    to_port         = var.cache_port
    protocol        = "tcp"
    security_groups = [var.ecs_api_security_group_id]
  }

  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-cache"
  }
}

# apps/game(room 분산 락 등)이 주로 쓰지만 apps/api도 함께 접근할 수 있는 공용 캐시라
# Service = "shared"로 태그한다.
resource "aws_elasticache_cluster" "main" {
  cluster_id           = "${var.project_name}-cache"
  engine               = "redis"
  engine_version       = var.cache_engine_version
  node_type            = var.cache_node_type
  num_cache_nodes      = 1
  port                 = var.cache_port
  parameter_group_name = "default.redis7"
  subnet_group_name    = aws_elasticache_subnet_group.main.name
  security_group_ids   = [aws_security_group.cache.id]

  tags = {
    Name    = "${var.project_name}-cache"
    Service = "shared"
  }
}
