variable "project_name" {
  description = "리소스 이름에 쓸 프로젝트 식별자 (다른 모듈과 동일하게 var.project_name을 그대로 받는다)"
  type        = string
}

variable "monthly_budget_usd" {
  description = "월간 AWS 비용 Budget 금액(USD). 계정 전체 비용 기준이다. 값을 코드에 하드코딩하지 않고 이 변수로만 관리한다 - terraform.tfvars 또는 TF_VAR_monthly_budget_usd로 지정할 것."
  type        = number
}

variable "budget_alert_emails" {
  description = "Budget(실제/예상 비용 임계값 초과)과 Cost Anomaly Detection 알림을 받을 이메일 주소 목록. 민감한 환경별 값이라 기본값을 두지 않는다 - terraform.tfvars(gitignore 대상) 또는 TF_VAR_budget_alert_emails로 지정할 것."
  type        = list(string)
  sensitive   = true
}

variable "cost_anomaly_threshold_usd" {
  description = "Cost Anomaly Detection이 알림을 보낼 이상 비용 절대값 임계치(USD). 이 금액 이상으로 추정되는 이상 비용 증가만 알린다."
  type        = number
  default     = 10
}
