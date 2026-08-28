# 월간 AWS 비용 Budget. 계정 전체 비용을 대상으로 하고(cost_filter 없음), 리소스 종료/변경
# 같은 Action은 만들지 않는다 - notification만 보낸다(§2 요구사항).
#
# 알림 임계치는 아래 5개를 최소로 지원한다(§2):
# - Actual(실제 발생 비용): 50%, 80%, 100%
# - Forecasted(AWS가 예측한 이번 달 말 예상 비용): 80%, 100%
#
# subscriber_email_addresses는 AWS Budgets가 SNS 없이 직접 지원하는 이메일 구독 방식이다
# (aws_budgets_budget_notification.subscriber_sns_topic_arns 대신). 이 프로젝트엔 기존
# SNS 토픽이 없고, 알림 채널이 이메일 하나면 충분하므로 SNS 토픽을 새로 만들지 않는다
# (§2 "과도한 구조를 만들지 않는 가장 단순한 방식" 요구사항).
resource "aws_budgets_budget" "monthly" {
  name         = "${var.project_name}-monthly-cost"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 50
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = var.budget_alert_emails
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = var.budget_alert_emails
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = var.budget_alert_emails
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = var.budget_alert_emails
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = var.budget_alert_emails
  }

  tags = {
    Name    = "${var.project_name}-monthly-cost"
    Service = "finops"
  }
}
