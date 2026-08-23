output "bastion_security_group_id" {
  description = "bastion 보안 그룹 ID (security 모듈의 app SG가 SSH 허용 소스로 참조)"
  value       = aws_security_group.bastion.id
}

output "bastion_public_ip" {
  description = "Bastion 인스턴스의 퍼블릭 IP (Elastic IP)"
  value       = aws_eip.bastion.public_ip
}

output "app_a_id" {
  description = "앱 서버(app_a) 인스턴스 ID (load_balancer 모듈의 타겟그룹 attachment용)"
  value       = aws_instance.app_a.id
}

output "app_a_private_ip" {
  description = "앱 서버(app_a)의 프라이빗 IP"
  value       = aws_instance.app_a.private_ip
}
