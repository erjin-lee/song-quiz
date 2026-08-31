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

# ECS Fargate 이관 2단계(docs/infra/ecs-fargate-migration-plan.md) - apps/api Fargate
# 태스크 전용 보안 그룹. game은 아직 app SG를 쓰는 EC2에 남아 있으므로 별도로 둔다
# (한쪽 컨테이너 포트 변경이 반대쪽에 영향을 주지 않게 하려는 목적 - 계획 문서 참고).
# SSH 규칙이 없다 - ECS 태스크는 SSH 접속 대상이 아니다.
resource "aws_security_group" "ecs_api" {
  name        = "${var.project_name}-ecs-api"
  description = "Security group for apps/api ECS Fargate tasks"
  vpc_id      = var.vpc_id

  ingress {
    description     = "App port from public tier"
    from_port       = var.app_port
    to_port         = var.app_port
    protocol        = "tcp"
    security_groups = [aws_security_group.public.id]
  }

  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-ecs-api"
  }
}

# ECS Fargate 이관 4단계 - apps/game Fargate 태스크 전용 보안 그룹. ecs_api(위)와 같은
# 이유로 SSH inbound가 없다. game은 RDS에 직접 접근하지 않으므로(ADR-0004) db SG의
# inbound source로는 추가하지 않는다 - Redis(cache 모듈)만 추가한다.
resource "aws_security_group" "ecs_game" {
  name        = "${var.project_name}-ecs-game"
  description = "Security group for apps/game ECS Fargate tasks"
  vpc_id      = var.vpc_id

  ingress {
    description     = "Game port from public tier"
    from_port       = var.game_port
    to_port         = var.game_port
    protocol        = "tcp"
    security_groups = [aws_security_group.public.id]
  }

  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-ecs-game"
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

  # ECS Fargate 이관 2단계 - apps/api가 app_a EC2에서 ecs_api SG를 쓰는 Fargate
  # 태스크로 옮겨간다. game은 DB에 직접 접근하지 않으므로(ADR-0004) app SG의 DB
  # 접근 규칙은 game이 EC2에 남아 있는 동안 굳이 지울 필요는 없지만(위 규칙 유지),
  # ecs_api를 추가로 허용해야 새 태스크가 RDS에 붙을 수 있다.
  ingress {
    description     = "DB port from ecs_api tier"
    from_port       = var.db_port
    to_port         = var.db_port
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_api.id]
  }

  # app_a(WAS) EC2가 ECS Fargate 이관 이후 정지 상태라(2026-08-29), bastion -> app_a
  # 2단 홉으로 DB에 접속하던 기존 터널링 경로(scripts/tunnel-db.sh)가 끊겼다. app_a를
  # 매번 껐다 켜지 않고도 운영 접속이 가능하도록, bastion에서 직접 DB로 접속을 허용한다 -
  # bastion은 애초에 이런 운영 접근 용도로 존재하는 인스턴스라 SSH(위 app 규칙)와 같은
  # 성격의 허용이다.
  ingress {
    description     = "DB port from bastion"
    from_port       = var.db_port
    to_port         = var.db_port
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
    Name = "${var.project_name}-db"
  }
}
