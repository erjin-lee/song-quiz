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

  # ECS Fargate 이관 2단계(docs/infra/ecs-fargate-migration-plan.md) - apps/api Task
  # Execution Role이 ECR pull/SSM 시크릿 복호화 권한을 제한할 때 쓴다.
  ecr_api_repository_arn      = module.ecr.api_repository_arn
  ecs_api_secret_arns         = values(local.api_secret_arns)
  ecs_api_secrets_kms_key_arn = aws_kms_key.api_secrets.arn

  # ECS Fargate 이관 4단계 - apps/game Task Execution Role도 같은 목적. KMS 키는 api와
  # 시크릿을 공유하므로(secrets.tf의 local.game_secret_arns) 동일한 aws_kms_key.api_secrets를 쓴다.
  ecr_game_repository_arn      = module.ecr.game_repository_arn
  ecs_game_secret_arns         = values(local.game_secret_arns)
  ecs_game_secrets_kms_key_arn = aws_kms_key.api_secrets.arn
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

  # ECS Fargate 이관 2단계 - "ec2"(기본값)면 지금과 동일하게 app_a EC2로, "ecs"로
  # 바꾸면 apps/api Fargate 태스크로 트래픽이 전환된다.
  api_traffic_target = var.api_traffic_target

  # ECS Fargate 이관 4단계 - api_traffic_target과 동일한 패턴의 Game 컷오버 스위치.
  game_traffic_target = var.game_traffic_target
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

  project_name               = var.project_name
  vpc_id                     = module.network.vpc_id
  private_db_subnet_ids      = module.network.private_db_subnet_ids
  app_security_group_id      = module.security.app_security_group_id
  ecs_api_security_group_id  = module.security.ecs_api_security_group_id
  ecs_game_security_group_id = module.security.ecs_game_security_group_id
  cache_port                 = var.cache_port
  cache_engine_version       = var.cache_engine_version
  cache_node_type            = var.cache_node_type
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

  # ECS Fargate 이관 2단계 - api_traffic_target을 "ecs"로 전환하기 전에 UnhealthyHost/
  # Target5xx/CPU/Memory 알람을 미리 만들어둔다(notification 모듈이 "SongQuiz-Prod-"
  # prefix로 자동 매칭하므로 별도 배선 없이 Slack까지 연결된다).
  api_ecs_target_group_arn_suffix = module.load_balancer.app_ecs_target_group_arn_suffix
  ecs_cluster_name                = module.ecs.cluster_name
  ecs_api_service_name            = module.ecs.api_service_name

  # ECS Fargate 이관 4단계 - api_ecs와 동일한 이유로 game_traffic_target 전환 전에
  # UnhealthyHost/Target5xx/CPU/Memory 알람을 미리 만들어둔다.
  game_ecs_target_group_arn_suffix = module.load_balancer.game_ecs_target_group_arn_suffix
  ecs_game_service_name            = module.ecs.game_service_name
}

# CloudWatch Alarm(SongQuiz-Prod-*) 상태 변화를 EventBridge -> Lambda로 받아 Slack에 전달한다.
# monitoring 모듈이 만드는 개별 Alarm 리소스를 직접 참조하지 않는다 - EventBridge event
# pattern이 alarm 이름 prefix로만 걸러내므로 두 모듈 사이에 Terraform 의존관계가 생기지 않는다.
module "notification" {
  source = "../../modules/notification"

  aws_region            = var.aws_region
  lambda_dist_path      = abspath("${path.root}/../../../../apps/lambda/alarm-notifier/dist")
  game_metric_namespace = module.logging.game_metric_namespace
}

# QuizSnapshotFailure/Game Target5xx/API Target5xx ALARM 전용 AIOps 흐름(Metrics/Logs/X-Ray
# 수집 -> OpenAI 분석 -> Slack). notification 모듈의 EventBridge Rule/Lambda는 전혀 참조하지
# 않는 독립된 경로다(§2, §36 - modules/aiops/eventbridge.tf 참고).
module "aiops" {
  source = "../../modules/aiops"

  aws_region          = var.aws_region
  lambda_dist_path    = abspath("${path.root}/../../../../apps/lambda/incident-analyzer/dist")
  game_log_group_name = module.logging.game_log_group_name
  game_log_group_arn  = module.logging.game_log_group_arn
  # API Target5xx 분석(§AIOps v1-3)의 Logs Insights 조회 대상.
  api_log_group_name = module.logging.api_log_group_name
  # 3단계 - EC2 app 타겟그룹과 별개로 ECS app_ecs 타겟그룹의 트래픽/5xx도 감시한다
  # (monitoring 모듈에 이미 전달하는 것과 동일한 값을 재사용).
  api_ecs_target_group_arn_suffix = module.load_balancer.app_ecs_target_group_arn_suffix
  api_log_group_arn               = module.logging.api_log_group_arn
  game_metric_namespace           = module.logging.game_metric_namespace
  alb_arn_suffix                  = module.load_balancer.arn_suffix
  api_target_group_arn_suffix     = module.load_balancer.app_target_group_arn_suffix
  game_target_group_arn_suffix    = module.load_balancer.game_target_group_arn_suffix
  db_instance_identifier          = module.database.identifier
  # Game Target5xx 분석(§AIOps v1-2)의 EC2/Redis Metric 조회용 - monitoring 모듈에 이미
  # 전달하는 것과 동일한 값을 그대로 재사용한다.
  ec2_instance_id      = module.compute.app_a_id
  ec2_metric_namespace = module.iam.ec2_metric_namespace
  cache_cluster_id     = module.cache.cluster_id
  # API Target5xx 분석(3단계)의 API 런타임 Metric 조회용 - monitoring 모듈에 이미 전달하는
  # 것과 동일한 ecs 모듈 출력을 그대로 재사용한다.
  ecs_cluster_name     = module.ecs.cluster_name
  ecs_api_service_name = module.ecs.api_service_name
  # Game Target5xx 분석(4단계 AIOps 보정)의 Game ECS 런타임 Metric 조회용 - api와 동일한
  # 이유로 monitoring 모듈에 이미 전달하는 것과 동일한 ecs/load_balancer 모듈 출력을
  # 그대로 재사용한다.
  ecs_game_service_name            = module.ecs.game_service_name
  game_ecs_target_group_arn_suffix = module.load_balancer.game_ecs_target_group_arn_suffix
}

# 계정 청구(Billing) 단위 리소스(Budget/Cost Anomaly Detection) - EC2/RDS 등 다른 모듈의
# output을 참조하지 않는 완전히 독립된 책임이라 별도 모듈로 둔다(notification이 aiops의
# EventBridge Rule을 참조하지 않는 것과 같은 이유).
module "finops" {
  source = "../../modules/finops"

  project_name               = var.project_name
  monthly_budget_usd         = var.monthly_budget_usd
  budget_alert_emails        = var.budget_alert_emails
  cost_anomaly_threshold_usd = var.cost_anomaly_threshold_usd
}

# 매일 전일 AWS 비용을 Cost Explorer에서 조회해 Slack으로 보내는 Lambda. notification/aiops와
# 동일하게 Lambda 하나 = 모듈 하나 컨벤션을 따른다. finops 모듈(Budget/Anomaly Detection)과는
# 서로 참조하지 않는 독립 경로다 - 이 Lambda가 실패해도 Budget/Anomaly 알림에는 영향 없다.
module "cost_reporter" {
  source = "../../modules/cost-reporter"

  aws_region       = var.aws_region
  lambda_dist_path = abspath("${path.root}/../../../../apps/lambda/cost-reporter/dist")
}

# ECS Fargate 이관 1단계(docs/infra/ecs-fargate-migration-plan.md) - api/game 이미지를
# 저장할 ECR 리포지토리만 먼저 만든다. 아직 다른 모듈의 output을 참조하지 않는 독립 모듈이다.
module "ecr" {
  source = "../../modules/ecr"

  project_name = var.project_name
}

# ECS Fargate 이관 2단계 - apps/api 컨테이너에 평문으로 주입할 환경변수. secrets.tf의
# api_secret_arns(시크릿)와 짝을 이룬다. DB_HOST_NAME/REDIS_HOST는 module.database/
# module.cache의 address 출력(호스트만, 포트 제외)을 쓴다 - endpoint 출력은 "호스트:포트"
# 형태라 DB_PORT/REDIS_PORT와 값이 겹친다.
locals {
  api_environment_variables = {
    NODE_ENV     = "production"
    PORT         = tostring(var.app_port)
    COMMIT_SHA   = var.api_image_git_sha
    DB_HOST_NAME = module.database.address
    DB_PORT      = tostring(var.db_port)
    DB_USER_NAME = var.db_username
    # var.db_name이 아니다 - var.db_name은 RDS 인스턴스 생성 시점에만 쓰이는 값이고
    # (현재 RDS에서는 비어있는 "appdb"), 실제 애플리케이션 테이블은 별도로 만들어진
    # api_db_schema_name 스키마에 있다. variables.tf의 설명 참고.
    DB_AUTH_DB_NAME = var.api_db_schema_name
    REDIS_HOST      = module.cache.address
    REDIS_PORT      = tostring(var.cache_port)
    REDIS_DB        = "0"
    CORS_ORIGIN     = "https://${var.domain_name}"
    COOKIE_DOMAIN   = ".${var.domain_name}"
    # game은 아직 EC2에 남아 있다(2단계는 api만 이관) - Fargate 태스크가 있는 public
    # 서브넷에서 game이 있는 private-app 서브넷으로 직접 SG 규칙을 새로 뚫는 대신,
    # 이미 열려 있는 public ALB(game 서브도메인)를 그대로 거쳐 호출한다.
    GAME_SERVICE_URL  = "https://${var.game_subdomain}.${var.domain_name}"
    AD_ENABLED        = "false"
    ADMIN_USER        = var.admin_user
    API_DOCS_USER     = var.api_docs_user
    MAIL_FROM_ADDRESS = var.mail_from_address
    # SES_ACCESS_KEY/SES_SECRET_KEY는 의도적으로 넣지 않는다 - MailService가 이제
    # 두 값이 모두 있을 때만 명시적 자격증명을 쓰므로(apps/api/src/mail/mail.service.ts),
    # 여기서 비워두면 AWS SDK 기본 provider chain이 ecs_api_task 역할(SES 발신 권한)을
    # 자동으로 쓴다.
    SES_REGION = var.aws_region
    # 3단계(트레이싱) - 같은 Task 안의 aws-otel-collector 사이드카(modules/ecs)로 OTLP를
    # 보낸다. awsvpc network mode라 localhost로 접근 가능. 이 값이 없으면
    # packages/tracing이 production 환경에서 트레이싱을 아예 비활성화한다
    # (packages/tracing/src/init-tracing.ts의 resolveTraceExporter 참고).
    OTEL_EXPORTER_OTLP_ENDPOINT = "http://localhost:4318"
  }

  # ECS Fargate 이관 4단계 - apps/game 컨테이너에 평문으로 주입할 환경변수.
  # secrets.tf의 local.game_secret_arns(시크릿)와 짝을 이룬다. REDIS_HOST/REDIS_PORT/
  # REDIS_DB는 apps/api와 같은 Redis 클러스터를 db 0으로 함께 쓴다(apps/game/src/cache/
  # cache.service.ts 기본값과 동일 - 키 네임스페이스는 REDIS_DB가 아니라 키 prefix로
  # 나뉜다). REDIS_PASSWORD는 넣지 않는다 - 이 ElastiCache 클러스터는 AUTH token을 쓰지
  # 않으므로(cache 모듈) 두 서비스 모두 process.env.REDIS_PASSWORD가 undefined일 때
  # 정상 동작한다. DB_* 환경변수는 없다 - Game은 RDS에 직접 접근하지 않는다(ADR-0004).
  game_environment_variables = {
    NODE_ENV   = "production"
    PORT       = tostring(var.game_port)
    COMMIT_SHA = var.game_image_git_sha
    REDIS_HOST = module.cache.address
    REDIS_PORT = tostring(var.cache_port)
    REDIS_DB   = "0"
    # api 서브도메인(public ALB)을 그대로 호출한다 - api_environment_variables의
    # GAME_SERVICE_URL과 동일한 이유: Game이 ECS(public subnet)로 옮겨간 뒤에도 이미
    # 열려 있는 public ALB 경로를 재사용하면 SG를 추가로 뚫을 필요가 없다.
    API_SERVICE_URL = "https://${var.api_subdomain}.${var.domain_name}"
    CORS_ORIGIN     = "https://${var.domain_name}"
    # Game tracing 추가(4단계 AIOps 보정 이후 후속 작업) - api_environment_variables의
    # OTEL_EXPORTER_OTLP_ENDPOINT와 동일한 이유로 game도 같은 Task 안의 aws-otel-collector
    # 사이드카(modules/ecs/game.tf)로 OTLP를 보낸다.
    OTEL_EXPORTER_OTLP_ENDPOINT = "http://localhost:4318"
  }
}

module "ecs" {
  source = "../../modules/ecs"

  project_name              = var.project_name
  aws_region                = var.aws_region
  public_subnet_ids         = module.network.public_subnet_ids
  ecs_api_security_group_id = module.security.ecs_api_security_group_id
  api_target_group_arn      = module.load_balancer.app_ecs_target_group_arn
  execution_role_arn        = module.iam.ecs_api_task_execution_role_arn
  task_role_arn             = module.iam.ecs_api_task_role_arn
  api_repository_url        = module.ecr.api_repository_url
  api_image_git_sha         = var.api_image_git_sha
  api_log_group_name        = module.logging.api_log_group_name
  app_port                  = var.app_port
  api_task_cpu              = var.api_task_cpu
  api_task_memory           = var.api_task_memory
  api_desired_count         = var.api_desired_count
  environment_variables     = local.api_environment_variables
  secret_arns               = local.api_secret_arns

  # ECS Fargate 이관 4단계 - apps/game
  ecs_game_security_group_id = module.security.ecs_game_security_group_id
  game_target_group_arn      = module.load_balancer.game_ecs_target_group_arn
  game_execution_role_arn    = module.iam.ecs_game_task_execution_role_arn
  # Game tracing 추가 - aws-otel-collector 사이드카가 이 Task Role로 X-Ray에 쓴다.
  game_task_role_arn         = module.iam.ecs_game_task_role_arn
  game_repository_url        = module.ecr.game_repository_url
  game_image_git_sha         = var.game_image_git_sha
  game_log_group_name        = module.logging.game_log_group_name
  game_port                  = var.game_port
  game_task_cpu              = var.game_task_cpu
  game_task_memory           = var.game_task_memory
  game_desired_count         = var.game_desired_count
  game_environment_variables = local.game_environment_variables
  game_secret_arns           = local.game_secret_arns

  # ECS Fargate 이관 5단계 - Auto Scaling
  api_autoscaling_min_capacity   = var.api_autoscaling_min_capacity
  api_autoscaling_max_capacity   = var.api_autoscaling_max_capacity
  api_autoscaling_cpu_target     = var.api_autoscaling_cpu_target
  api_autoscaling_memory_target  = var.api_autoscaling_memory_target
  game_autoscaling_min_capacity  = var.game_autoscaling_min_capacity
  game_autoscaling_max_capacity  = var.game_autoscaling_max_capacity
  game_autoscaling_cpu_target    = var.game_autoscaling_cpu_target
  game_autoscaling_memory_target = var.game_autoscaling_memory_target

  # aws_ecs_service.api/game은 api_target_group_arn/game_target_group_arn(위)을 통해
  # module.load_balancer의 aws_lb_target_group.app_ecs/game_ecs에는 이미 참조 기반
  # 의존성이 있지만, 그 타겟그룹을 실제로 "리스너(규칙)에 연결"하는 aws_lb_listener.https/
  # aws_lb_listener_rule.game(둘 다 weighted forward)은 별도 리소스라 이 참조만으로는
  # 순서가 보장되지 않는다 - 최초 apply에서 둘이 병렬로 실행되면 ECS가 서비스를 만들려는
  # 시점에 타겟그룹이 아직 어떤 리스너에도 연결되지 않은 상태일 수 있어
  # "target group ... does not have an associated load balancer"로 실패할 수 있다.
  # module 전체에 대한 depends_on으로 load_balancer의 모든 리소스(리스너/규칙 포함)가
  # 끝난 뒤에만 ecs가 시작되도록 명시적으로 순서를 고정한다.
  depends_on = [module.load_balancer]
}
