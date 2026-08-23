# VPC, 서브넷, 라우팅을 묶은 네트워크 계층 모듈.
# 원래 루트의 main.tf(VPC) + subnets.tf + route_tables.tf를 그대로 옮긴 것으로,
# 리소스 정의 자체는 바뀌지 않았다.

resource "aws_vpc" "main" {
  cidr_block = var.vpc_cidr

  # DNS 관련 옵션. 인스턴스에 퍼블릭 도메인/DNS 해석이 필요하므로 켜 둔다.
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = var.project_name
  }
}

# Public Subnets
# Internet Gateway로 향하는 라우팅이 붙어야 실제로 인터넷과 통신 가능해진다.
# map_public_ip_on_launch를 켜 두면 이 서브넷에 생성되는 인스턴스가 자동으로 퍼블릭 IP를 받는다.

resource "aws_subnet" "public_a" {
  vpc_id                  = aws_vpc.main.id
  availability_zone       = var.availability_zones[0]
  cidr_block              = "10.0.0.0/24"
  map_public_ip_on_launch = true

  tags = {
    Name = "${var.project_name}-public-a"
    Tier = "public"
  }
}

resource "aws_subnet" "public_c" {
  vpc_id                  = aws_vpc.main.id
  availability_zone       = var.availability_zones[1]
  cidr_block              = "10.0.1.0/24"
  map_public_ip_on_launch = true

  tags = {
    Name = "${var.project_name}-public-c"
    Tier = "public"
  }
}

# Private App Subnets
# 애플리케이션 서버 배치용. 인터넷에서 직접 접근할 수 없고, 아웃바운드는 NAT Gateway를 거친다.

resource "aws_subnet" "private_app_a" {
  vpc_id            = aws_vpc.main.id
  availability_zone = var.availability_zones[0]
  cidr_block        = "10.0.10.0/24"

  tags = {
    Name = "${var.project_name}-private-app-a"
    Tier = "private-app"
  }
}

resource "aws_subnet" "private_app_c" {
  vpc_id            = aws_vpc.main.id
  availability_zone = var.availability_zones[1]
  cidr_block        = "10.0.11.0/24"

  tags = {
    Name = "${var.project_name}-private-app-c"
    Tier = "private-app"
  }
}

# Private DB Subnets
# 데이터베이스 배치용. 가장 격리 수준이 높은 계층으로, 원칙적으로 인터넷으로 나가는 경로가 필요 없다.

resource "aws_subnet" "private_db_a" {
  vpc_id            = aws_vpc.main.id
  availability_zone = var.availability_zones[0]
  cidr_block        = "10.0.20.0/24"

  tags = {
    Name = "${var.project_name}-private-db-a"
    Tier = "private-db"
  }
}

resource "aws_subnet" "private_db_c" {
  vpc_id            = aws_vpc.main.id
  availability_zone = var.availability_zones[1]
  cidr_block        = "10.0.21.0/24"

  tags = {
    Name = "${var.project_name}-private-db-c"
    Tier = "private-db"
  }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "${var.project_name}-igw"
  }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "${var.project_name}-public"
  }
}

# 모든 목적지(0.0.0.0/0)로 향하는 트래픽을 Internet Gateway로 보낸다.
resource "aws_route" "public_internet_access" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.main.id
}

resource "aws_route_table_association" "public_a" {
  subnet_id      = aws_subnet.public_a.id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "public_c" {
  subnet_id      = aws_subnet.public_c.id
  route_table_id = aws_route_table.public.id
}

resource "aws_eip" "nat" {
  domain = "vpc"

  tags = {
    Name = "${var.project_name}-nat"
  }

  depends_on = [aws_internet_gateway.main]
}

# public_a에 배치 - NAT 자신도 IGW를 거쳐 인터넷과 통신해야 한다.
resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public_a.id

  tags = {
    Name = "${var.project_name}-nat"
  }

  depends_on = [aws_internet_gateway.main]
}

resource "aws_route_table" "private_app" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "${var.project_name}-private-app"
  }
}

# private_app에서 나가는 모든 트래픽을 NAT Gateway로 보낸다.
resource "aws_route" "private_app_nat_access" {
  route_table_id         = aws_route_table.private_app.id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.main.id
}

resource "aws_route_table_association" "private_app_a" {
  subnet_id      = aws_subnet.private_app_a.id
  route_table_id = aws_route_table.private_app.id
}

resource "aws_route_table_association" "private_app_c" {
  subnet_id      = aws_subnet.private_app_c.id
  route_table_id = aws_route_table.private_app.id
}
