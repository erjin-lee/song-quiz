# public/app/db 3계층 보안 그룹. 원래 루트의 security.tf 그대로다.
# bastion용 보안 그룹은 compute 모듈에, cache용 보안 그룹은 cache 모듈에 남아 있다
# (각자를 만드는 리소스와 같은 모듈에 두는 편이 응집도가 높기 때문).

resource "aws_security_group" "public" {
  name        = "${var.project_name}-public"
  description = "Security group for public tier (web/ALB)"
  vpc_id      = var.vpc_id

  ingress {
    description = "HTTP from internet"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS from internet"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-public"
  }
}

resource "aws_security_group" "app" {
  name        = "${var.project_name}-app"
  description = "Security group for private app tier"
  vpc_id      = var.vpc_id

  ingress {
    description     = "App port from public tier"
    from_port       = var.app_port
    to_port         = var.app_port
    protocol        = "tcp"
    security_groups = [aws_security_group.public.id]
  }

  # apps/game(room + Socket.IO)이 apps/api와 같은 인스턴스(app_a)에서 다른 포트로
  # 함께 실행된다. 별도 인스턴스로 분리하기 전까지는 이 SG를 그대로 공유한다.
  ingress {
    description     = "Game port from public tier"
    from_port       = var.game_port
    to_port         = var.game_port
    protocol        = "tcp"
    security_groups = [aws_security_group.public.id]
  }

  ingress {
    description     = "SSH from bastion"
    from_port       = 22
    to_port         = 22
    protocol        = "tcp"
    security_groups = [var.bastion_security_group_id]
  }

  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-app"
  }
}

resource "aws_security_group" "db" {
  name        = "${var.project_name}-db"
  description = "Security group for private db tier"
  vpc_id      = var.vpc_id

  ingress {
    description     = "DB port from app tier"
    from_port       = var.db_port
    to_port         = var.db_port
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }

  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-db"
  }
}
