# ALB + 타겟그룹 + 리스너. 원래 루트의 load_balancer.tf 그대로다.

# api/game 타겟그룹을 하나의 ALB가 함께 라우팅하므로(리스너 규칙으로만 구분) ALB 자체의
# 시간당/LCU 요금은 한쪽 서비스로 나눌 수 없어 Service = "shared"로 태그한다(타겟그룹은
# 별도 청구 항목이 아니라 태그를 추가하지 않는다).
resource "aws_lb" "main" {
  name               = "${var.project_name}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [var.public_security_group_id]
  subnets            = var.public_subnet_ids

  tags = {
    Name    = "${var.project_name}-alb"
    Service = "shared"
  }
}

resource "aws_lb_target_group" "app" {
  name     = "${var.project_name}-app"
  port     = var.app_port
  protocol = "HTTP"
  vpc_id   = var.vpc_id

  health_check {
    path                = var.alb_health_check_path
    protocol            = "HTTP"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 2
  }

  tags = {
    Name = "${var.project_name}-app"
  }
}

resource "aws_lb_target_group_attachment" "app_a" {
  target_group_arn = aws_lb_target_group.app.arn
  target_id        = var.app_instance_id
  port             = var.app_port
}

# ECS Fargate 이관 2단계(docs/infra/ecs-fargate-migration-plan.md) - apps/api Fargate
# 태스크용 타겟그룹. 기존 app 타겟그룹(위, target_type 기본값 "instance")을 재사용하지
# 않고 별도로 만드는 이유: target_type은 생성 후 바꿀 수 없는 속성이라, 기존 app을
# "ip"로 바꾸면 Terraform이 그 타겟그룹을 destroy+recreate한다 - 그 순간 지금 트래픽을
# 받고 있는 app_a EC2가 타겟그룹째로 사라져 API가 끊긴다. 별도 타겟그룹을 만들고
# default_action만 전환하면(아래) 트래픽 컷오버 자체가 순간적인 in-place 업데이트가
# 되고, 문제가 생기면 var.api_traffic_target을 다시 "ec2"로 돌리는 것만으로 즉시
# 롤백된다 - app 타겟그룹과 app_a attachment는 그대로 살아있기 때문이다.
resource "aws_lb_target_group" "app_ecs" {
  name        = "${var.project_name}-app-ecs"
  port        = var.app_port
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  # 기존 EC2 app 타겟그룹(위)의 헬스체크(var.alb_health_check_path = "/health")는
  # liveness만 본다 - 프로세스가 살아있으면 DB/Redis 연결 여부와 무관하게 200을
  # 반환한다. Fargate 태스크는 시작 직후 이 시점 차이가 실제로 문제가 될 수 있어
  # (컨테이너는 떴지만 아직 DB/Redis에 연결되지 않은 순간에 ALB가 트래픽을 보낼 수
  # 있음), app_ecs는 readiness(/ready, DB+Redis 확인 후 200/503)를 쓴다.
  health_check {
    path                = var.api_ecs_health_check_path
    protocol            = "HTTP"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 2
  }

  tags = {
    Name = "${var.project_name}-app-ecs"
  }
}

# apps/game은 apps/api와 같은 인스턴스(app_a)에서 다른 포트로 함께 실행된다.
# 별도 타겟그룹을 두는 이유는 ALB가 두 프로세스의 헬스체크를 독립적으로 판단하고
# (한쪽이 죽어도 다른 쪽 라우팅에 영향 없음), 리스너 규칙으로 서브도메인별 트래픽을
# 각자에게 보낼 수 있어야 하기 때문이다.
resource "aws_lb_target_group" "game" {
  name     = "${var.project_name}-game"
  port     = var.game_port
  protocol = "HTTP"
  vpc_id   = var.vpc_id

  health_check {
    path                = var.alb_health_check_path
    protocol            = "HTTP"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 2
  }

  tags = {
    Name = "${var.project_name}-game"
  }
}

resource "aws_lb_target_group_attachment" "game_a" {
  target_group_arn = aws_lb_target_group.game.arn
  target_id        = var.app_instance_id
  port             = var.game_port
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.certificate_arn

  # Host 헤더 규칙에 걸리지 않는 모든 트래픽(api 서브도메인 포함)은 이 default_action이
  # 받는다. var.api_traffic_target으로 EC2(app)/ECS(app_ecs) 타겟그룹 중 어디로 보낼지
  # 고른다 - target_group_arn 값만 바뀌는 in-place 업데이트라 전환 자체는 순간적이다.
  default_action {
    type             = "forward"
    target_group_arn = var.api_traffic_target == "ecs" ? aws_lb_target_group.app_ecs.arn : aws_lb_target_group.app.arn
  }
}

# game 서브도메인으로 온 요청만 apps/game 타겟그룹으로 보낸다. default_action보다
# 먼저 평가되므로, api 서브도메인/그 외 트래픽에는 영향이 없다.
resource "aws_lb_listener_rule" "game" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 100

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.game.arn
  }

  condition {
    host_header {
      values = ["${var.game_subdomain}.${var.domain_name}"]
    }
  }
}
