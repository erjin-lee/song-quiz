# apps/api, apps/game 컨테이너 이미지를 저장할 ECR 프라이빗 리포지토리 2개.
# ECS Fargate 이관 1단계(docs/infra/ecs-fargate-migration-plan.md) - 아직 ECS 리소스는
# 만들지 않고, CI(.github/workflows/publish-ecr.yml)가 이미지를 빌드해 push할 대상만
# 먼저 준비한다.

resource "aws_ecr_repository" "api" {
  name = "${var.project_name}-api"

  # 같은 태그를 다시 push해서 조용히 덮어쓰는 것을 막는다 - 이미지 태그는 git commit
  # SHA 기반(publish-ecr.yml 참고)이라 태그 하나가 항상 정확히 하나의 커밋을 가리켜야
  # 나중에 "지금 무슨 커밋이 떠 있는지"를 태그만으로 신뢰할 수 있다.
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Name    = "${var.project_name}-api"
    Service = "api"
  }
}

resource "aws_ecr_repository" "game" {
  name                 = "${var.project_name}-game"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Name    = "${var.project_name}-game"
    Service = "game"
  }
}

# 태그 없는 이미지(빌드 실패/재시도 등으로 남는 dangling 매니페스트)와, 오래 쌓인 태그
# 이미지를 정리해 ECR 스토리지 비용이 무한히 늘지 않게 한다. 아직 어떤 이미지도 실제
# 서비스에 쓰이지 않는 1단계 특성상 "몇 개까지 보관할지"는 넉넉하게 잡아둔다.
resource "aws_ecr_lifecycle_policy" "api" {
  repository = aws_ecr_repository.api.name
  policy     = local.lifecycle_policy
}

resource "aws_ecr_lifecycle_policy" "game" {
  repository = aws_ecr_repository.game.name
  policy     = local.lifecycle_policy
}

locals {
  lifecycle_policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Expire untagged images after 1 day"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 1
        }
        action = { type = "expire" }
      },
      {
        rulePriority = 2
        description  = "Keep only the most recent 20 sha-tagged images"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["sha-"]
          countType     = "imageCountMoreThan"
          countNumber   = 20
        }
        action = { type = "expire" }
      }
    ]
  })
}
