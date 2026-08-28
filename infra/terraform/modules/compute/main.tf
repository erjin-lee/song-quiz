# bastion + 앱 서버(app_a) 인스턴스. 원래 루트의 compute.tf 그대로다.

# 최신 Amazon Linux 2023 AMI를 조회한다 (AMI ID를 하드코딩하지 않기 위함).
data "aws_ami" "amazon_linux" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# 최신 Ubuntu 24.04 LTS AMI를 조회한다 (Canonical 공식 계정).
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "aws_key_pair" "bastion" {
  key_name   = "${var.project_name}-bastion"
  public_key = file(pathexpand(var.bastion_public_key_path))
}

resource "aws_security_group" "bastion" {
  name        = "${var.project_name}-bastion"
  description = "Security group for bastion host"
  vpc_id      = var.vpc_id

  ingress {
    description = "SSH from anywhere (GitHub Actions runner IP is not fixed)"
    from_port   = 22
    to_port     = 22
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
    Name = "${var.project_name}-bastion"
  }
}

resource "aws_instance" "bastion" {
  ami                         = data.aws_ami.amazon_linux.id
  instance_type               = var.bastion_instance_type
  subnet_id                   = var.public_subnet_a_id
  key_name                    = aws_key_pair.bastion.key_name
  vpc_security_group_ids      = [aws_security_group.bastion.id]
  associate_public_ip_address = true

  # bastion은 api/game 어느 한쪽 서비스 전용이 아니라 운영 접근용 공용 인스턴스라
  # Service = "shared"로 태그한다.
  tags = {
    Name    = "${var.project_name}-bastion"
    Service = "shared"
  }

  # data.aws_ami.amazon_linux가 most_recent = true라서 AWS가 새 AMI를 배포할 때마다
  # ami 값이 바뀌는데, 이 속성은 변경 시 인스턴스를 강제로 교체(destroy + create)한다.
  # bastion을 의도치 않게 재생성하지 않도록 ami 변경 감지를 무시한다. AMI를 실제로
  # 갱신하고 싶을 때는 이 lifecycle 블록을 잠시 지우고 plan/apply 하면 된다.
  lifecycle {
    ignore_changes = [ami]
  }
}

resource "aws_eip" "bastion" {
  domain   = "vpc"
  instance = aws_instance.bastion.id

  tags = {
    Name    = "${var.project_name}-bastion"
    Service = "shared"
  }
}

# apps/api와 apps/game이 같은 인스턴스에서 다른 포트로 함께 실행되므로(root main.tf 주석
# 참고) 이 인스턴스 비용은 한쪽 서비스에 귀속시킬 수 없어 Service = "shared"로 태그한다.
resource "aws_instance" "app_a" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.app_instance_type
  subnet_id              = var.private_app_subnet_a_id
  key_name               = aws_key_pair.bastion.key_name
  vpc_security_group_ids = [var.app_security_group_id]
  iam_instance_profile   = var.iam_instance_profile_name

  tags = {
    Name    = "${var.project_name}-app-a"
    Service = "shared"
  }
}
