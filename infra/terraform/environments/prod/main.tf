# Route53 호스팅 영역은 acm/web/dns/ses 네 모듈이 공통으로 참조하므로 루트에서 한 번만 조회한다.
# 콘솔에서 이미 만든 호스팅 영역을 조회만 한다 (재생성하지 않음).
data "aws_route53_zone" "main" {
  name         = var.domain_name
  private_zone = false
}

module "network" {
  source = "../../modules/network"

  project_name       = var.project_name
  vpc_cidr           = var.vpc_cidr
  availability_zones = var.availability_zones
}

# security.app SG는 compute.bastion SG를 SSH 허용 소스로 참조하고,
# compute.app_a 인스턴스는 security.app SG를 참조한다. 서로 다른 리소스 간의
# 참조라 순환이 아니다 - module.security와 module.compute를 어느 순서로 적어도 무방하다.
module "security" {
  source = "../../modules/security"

  project_name              = var.project_name
  vpc_id                    = module.network.vpc_id
  app_port                  = var.app_port
  game_port                 = var.game_port
  db_port                   = var.db_port
  bastion_security_group_id = module.compute.bastion_security_group_id
}

module "logging" {
  source = "../../modules/logging"

  project_name = var.project_name
}

module "iam" {
  source = "../../modules/iam"

  project_name            = var.project_name
  ses_domain_identity_arn = module.ses.domain_identity_arn
  api_log_group_arn       = module.logging.api_log_group_arn
  game_log_group_arn      = module.logging.game_log_group_arn
}

module "compute" {
  source = "../../modules/compute"

  project_name              = var.project_name
  vpc_id                    = module.network.vpc_id
  public_subnet_a_id        = module.network.public_subnet_a_id
  private_app_subnet_a_id   = module.network.private_app_subnet_a_id
  bastion_public_key_path   = var.bastion_public_key_path
  bastion_instance_type     = var.bastion_instance_type
  app_instance_type         = var.app_instance_type
  app_security_group_id     = module.security.app_security_group_id
  iam_instance_profile_name = module.iam.instance_profile_name
}

module "load_balancer" {
  source = "../../modules/load_balancer"

  project_name             = var.project_name
  vpc_id                   = module.network.vpc_id
  public_subnet_ids        = module.network.public_subnet_ids
  public_security_group_id = module.security.public_security_group_id
  app_port                 = var.app_port
  game_port                = var.game_port
  alb_health_check_path    = var.alb_health_check_path
  app_instance_id          = module.compute.app_a_id
  certificate_arn          = module.acm.certificate_arn
  game_subdomain           = var.game_subdomain
  domain_name              = var.domain_name
}

module "acm" {
  source = "../../modules/acm"

  project_name    = var.project_name
  domain_name     = var.domain_name
  route53_zone_id = data.aws_route53_zone.main.zone_id
}

module "web" {
  source = "../../modules/web"

  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }

  project_name                     = var.project_name
  domain_name                      = var.domain_name
  route53_zone_id                  = data.aws_route53_zone.main.zone_id
  existing_validation_record_names = module.acm.validation_record_names

  # web 모듈의 ACM 검증용 Route53 레코드가 acm 모듈의 레코드와 같은 이름으로
  # 동시에 생성되면서 충돌("already exists")하지 않도록, acm 모듈이 먼저 끝나게 한다.
  depends_on = [module.acm]
}

module "dns" {
  source = "../../modules/dns"

  route53_zone_id = data.aws_route53_zone.main.zone_id
  api_subdomain   = var.api_subdomain
  game_subdomain  = var.game_subdomain
  domain_name     = var.domain_name
  lb_dns_name     = module.load_balancer.dns_name
  lb_zone_id      = module.load_balancer.zone_id
}

module "ses" {
  source = "../../modules/ses"

  domain_name     = var.domain_name
  route53_zone_id = data.aws_route53_zone.main.zone_id
}

module "database" {
  source = "../../modules/database"

  project_name           = var.project_name
  private_db_subnet_ids  = module.network.private_db_subnet_ids
  db_security_group_id   = module.security.db_security_group_id
  db_engine_version      = var.db_engine_version
  db_instance_class      = var.db_instance_class
  db_allocated_storage   = var.db_allocated_storage
  db_name                = var.db_name
  db_username            = var.db_username
  db_password            = var.db_password
  db_multi_az            = var.db_multi_az
  db_deletion_protection = var.db_deletion_protection
}

module "cache" {
  source = "../../modules/cache"

  project_name          = var.project_name
  vpc_id                = module.network.vpc_id
  private_db_subnet_ids = module.network.private_db_subnet_ids
  app_security_group_id = module.security.app_security_group_id
  cache_port            = var.cache_port
  cache_engine_version  = var.cache_engine_version
  cache_node_type       = var.cache_node_type
}

module "monitoring" {
  source = "../../modules/monitoring"

  aws_region                   = var.aws_region
  alb_arn_suffix               = module.load_balancer.arn_suffix
  api_target_group_arn_suffix  = module.load_balancer.app_target_group_arn_suffix
  game_target_group_arn_suffix = module.load_balancer.game_target_group_arn_suffix
  app_instance_id              = module.compute.app_a_id
  db_instance_identifier       = module.database.identifier
  cache_cluster_id             = module.cache.cluster_id
  game_metric_namespace        = module.logging.game_metric_namespace
  ec2_metric_namespace         = module.iam.ec2_metric_namespace
}

# CloudWatch Alarm(SongQuiz-Prod-*) 상태 변화를 EventBridge -> Lambda로 받아 Slack에 전달한다.
# monitoring 모듈이 만드는 개별 Alarm 리소스를 직접 참조하지 않는다 - EventBridge event
# pattern이 alarm 이름 prefix로만 걸러내므로 두 모듈 사이에 Terraform 의존관계가 생기지 않는다.
module "notification" {
  source = "../../modules/notification"

  aws_region       = var.aws_region
  lambda_dist_path = abspath("${path.root}/../../../../apps/lambda/alarm-notifier/dist")
}
