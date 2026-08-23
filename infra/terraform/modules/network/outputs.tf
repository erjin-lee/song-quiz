output "vpc_id" {
  description = "생성된 VPC의 ID"
  value       = aws_vpc.main.id
}

output "vpc_cidr_block" {
  description = "생성된 VPC의 CIDR 블록"
  value       = aws_vpc.main.cidr_block
}

output "public_subnet_ids" {
  description = "퍼블릭 서브넷 ID 목록"
  value       = [aws_subnet.public_a.id, aws_subnet.public_c.id]
}

output "public_subnet_a_id" {
  description = "퍼블릭 서브넷(a) ID (bastion 배치용)"
  value       = aws_subnet.public_a.id
}

output "private_app_subnet_ids" {
  description = "프라이빗 앱 서브넷 ID 목록"
  value       = [aws_subnet.private_app_a.id, aws_subnet.private_app_c.id]
}

output "private_app_subnet_a_id" {
  description = "프라이빗 앱 서브넷(a) ID (app_a 인스턴스 배치용)"
  value       = aws_subnet.private_app_a.id
}

output "private_db_subnet_ids" {
  description = "프라이빗 DB 서브넷 ID 목록"
  value       = [aws_subnet.private_db_a.id, aws_subnet.private_db_c.id]
}

output "internet_gateway_id" {
  description = "VPC에 연결된 Internet Gateway ID"
  value       = aws_internet_gateway.main.id
}

output "nat_gateway_public_ip" {
  description = "NAT Gateway의 퍼블릭 IP"
  value       = aws_eip.nat.public_ip
}
