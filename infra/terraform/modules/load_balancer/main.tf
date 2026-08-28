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

  # Host 헤더 규칙에 걸리지 않는 모든 트래픽(api 서브도메인 포함)은 기존과 동일하게
  # apps/api로 간다 - 이 default_action은 바꾸지 않는다.
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
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
