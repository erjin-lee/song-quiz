# Cost Anomaly Detection: Budget처럼 정해진 한도가 아니라, 계정의 과거 지출 패턴 대비
# "평소와 다르게" 튀는 비용을 AWS가 자체 학습한 기준으로 미리 잡아낸다(§3) - Budget이
# 월 한도 도달 여부만 보는 것과 서로 보완 관계다(README에 차이를 설명).
#
# monitor_type = "DIMENSIONAL" + monitor_dimension = "SERVICE" 하나로 계정 전체 AWS 서비스
# 비용을 관찰한다 - 서비스별 Monitor를 여러 개 두지 않는다(§3 "Monitor 하나를 우선 검토").
resource "aws_ce_anomaly_monitor" "all_services" {
  name              = "${var.project_name}-all-services"
  monitor_type      = "DIMENSIONAL"
  monitor_dimension = "SERVICE"

  tags = {
    Name    = "${var.project_name}-all-services"
    Service = "finops"
  }
}

# threshold_expression: 예상 영향(ANOMALY_TOTAL_IMPACT_ABSOLUTE, USD 절대값)이
# var.cost_anomaly_threshold_usd 이상인 이상 비용만 알린다 - 너무 작은 변동까지 매번
# 알리지 않기 위함. frequency = DAILY로 하루에 한 번 모아 보낸다(즉시성보다 알림 피로도를
# 낮추는 쪽을 택함 - Budget이 이미 실시간에 가깝게 임계치 알림을 별도로 보낸다).
resource "aws_ce_anomaly_subscription" "all_services" {
  name      = "${var.project_name}-all-services"
  frequency = "DAILY"

  monitor_arn_list = [aws_ce_anomaly_monitor.all_services.arn]

  dynamic "subscriber" {
    for_each = var.budget_alert_emails

    content {
      type    = "EMAIL"
      address = subscriber.value
    }
  }

  threshold_expression {
    dimension {
      key           = "ANOMALY_TOTAL_IMPACT_ABSOLUTE"
      match_options = ["GREATER_THAN_OR_EQUAL"]
      values        = [tostring(var.cost_anomaly_threshold_usd)]
    }
  }

  tags = {
    Name    = "${var.project_name}-all-services"
    Service = "finops"
  }
}
