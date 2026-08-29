# Terraform Infrastructure Project

## Goal

This repository manages AWS infrastructure using Terraform.

The developer is learning Terraform, so prioritize:

* correctness
* safety
* readability
* explaining Terraform concepts and design decisions
* incremental changes over large implementations

Do not optimize for writing the most code quickly.

## Working Style

* 설명과 작업 결과는 한국어로 작성한다.

Before making significant Terraform changes:

1. Inspect the existing Terraform files and project structure.
2. Explain what will be changed and why.
3. Identify AWS resources that will be created, modified, replaced, or deleted.
4. Make the smallest reasonable change.
5. Run formatting and validation after changes.

When introducing a Terraform concept for the first time, briefly explain:

* what it does
* why it is needed
* why this approach was chosen

Do not introduce abstractions, modules, or complex patterns unless they provide a clear benefit.

## Terraform Workflow

After modifying Terraform files, run:

```bash
terraform fmt -recursive
terraform validate
```

Run `terraform plan` when it is useful to verify infrastructure changes.

Before running a plan, explain what changes are expected.

After running a plan, summarize:

* resources to add
* resources to change
* resources to destroy
* unexpected replacements or destructive changes

Never treat a successful `terraform validate` as proof that the infrastructure configuration is operationally correct.

## Safety Rules

Never automatically run:

```bash
terraform apply
terraform destroy
terraform import
terraform state rm
terraform state mv
terraform state push
terraform force-unlock
```

The developer will execute infrastructure-changing commands manually unless explicitly decided otherwise.

Never manually edit Terraform state files.

Never delete, replace, or recreate existing AWS resources without explicitly explaining the impact first.

If a Terraform plan contains resource destruction or replacement, stop and explain:

* which resource is affected
* why Terraform wants to replace/delete it
* possible service impact
* whether there is a safer alternative

## AWS Safety

Do not hardcode:

* AWS access keys
* AWS secret keys
* passwords
* API keys
* private keys
* other credentials

Use AWS profiles, IAM roles, environment variables, or an appropriate secrets-management mechanism.

Do not commit sensitive values to:

* `.tf`
* `.tfvars`
* `.tfstate`
* `.tfstate.backup`
* plan files

Mark sensitive Terraform variables and outputs appropriately when they contain secrets.

When creating AWS resources, consider:

* availability
* security groups and network exposure
* IAM least privilege
* encryption
* backup requirements
* deletion protection
* operational cost

Do not add infrastructure solely because it is considered a general best practice.
Explain why it is necessary for this project.

## Terraform Code Style

Follow standard Terraform formatting using `terraform fmt`.

Prefer clear resource names over abbreviations.

Prefer:

```hcl
aws_security_group.application
aws_lb.application
aws_db_subnet_group.database
```

over unclear names such as:

```hcl
aws_security_group.sg1
aws_lb.lb1
```

Use variables for values that:

* differ between environments
* are deployment-specific
* are likely to change

Use locals for derived or repeated values.

Use outputs only for values useful to users, other modules, deployment systems, or operations.

Avoid unnecessary variables for values that are truly implementation details.

## Project Structure

2026-08-23에 개발자 요청으로 아래 구조로 전환했다 (환경은 여전히 prod 하나뿐이지만,
실무에서 흔히 쓰는 modules/ + environments/ 형태를 학습 목적으로 미리 적용함):

```text
.
├── environments/
│   └── prod/              # 실행 루트 (terraform init/plan/apply는 여기서)
│       ├── versions.tf
│       ├── providers.tf
│       ├── variables.tf
│       ├── main.tf        # 모듈 호출 + 공통 데이터 소스(Route53 zone)
│       ├── outputs.tf
│       ├── moved.tf       # 구조 전환 시 리소스 주소 이동 기록 (moved 블록)
│       ├── terraform.tfvars.example
│       ├── terraform.tfvars      # gitignore 대상
│       ├── terraform.tfstate*    # gitignore 대상
│       ├── scripts/       # bastion/tunnel 스크립트 (terraform output 사용)
│       └── cloudwatch-agent/  # app_a에 수동 설치한 CloudWatch Agent 설정의 source of truth
│                               # (Terraform 리소스 아님 - EC2에 수동 복사/적용)
└── modules/
    ├── network/           # VPC, 서브넷, 라우팅 - NAT Gateway/EIP/private-app NAT route는
                             # ECS Fargate 이관 완료 후 제거했다(2026-08-29, ECS Fargate
                             # 이관 계획 문서 "NAT Gateway 제거 조건" 참고). private-app
                             # 서브넷/라우트 테이블 자체는 app_a(정지 상태) 때문에 남아있다.
    ├── security/          # public/app/db 보안 그룹 + ecs_api 보안 그룹(ECS Fargate
    │                       # 이관 2단계, 2026-08-28) + ecs_game 보안 그룹(4단계, 2026-08-29)
    ├── iam/                # app 인스턴스 역할/정책 + apps/api ECS Task Execution/Task
    │                       # Role(2단계) + Task Role의 X-Ray 쓰기 권한(3단계, 2026-08-29 -
    │                       # ecs 모듈의 aws-otel-collector 사이드카가 이 권한으로 X-Ray에 쓴다)
    │                       # + apps/game ECS Task Execution Role(4단계, 2026-08-29) - game은
    │                       # AWS SDK를 직접 쓰지 않아 별도 Task Role은 아직 없다
    ├── compute/           # bastion + app_a 인스턴스
    ├── load_balancer/     # ALB, 타겟그룹, 리스너 + app_ecs 타겟그룹(2단계, ALB
    │                       # default_action은 api_traffic_target 변수로 EC2/ECS 전환) +
    │                       # game_ecs 타겟그룹(4단계, game 리스너 규칙이 game_traffic_target
    │                       # 변수로 EC2/ECS weighted forward 전환 - sticky session 없음,
    │                       # WebSocket-only 확인됨)
    ├── acm/                # ALB용 와일드카드 인증서
    ├── web/                # S3 + CloudFront (정적 웹)
    ├── dns/                # api/game 서브도메인 레코드
    ├── ses/                # SES 도메인 인증 + DKIM
    ├── database/          # RDS (address output은 ECS 태스크의 DB_HOST_NAME 환경변수용, 2단계) -
    │                       # apps/game은 RDS에 직접 접근하지 않아(ADR-0004) ecs_game SG는
    │                       # 추가하지 않는다
    ├── cache/              # ElastiCache (address output/ecs_api SG 규칙도 2단계 추가,
    │                       # ecs_game SG 규칙은 4단계 추가)
    ├── logging/            # CloudWatch Log Group(api/game) + Game 실패 이벤트 Metric Filter
    ├── monitoring/         # CloudWatch Dashboard(SongQuiz-Prod) + Alarm 1차 세트(alarms.tf) -
                             # 다른 모듈의 output만 참조, 새 Custom Metric/Metric Filter는 만들지
                             # 않고 기존 지표를 시각화/알람화만 한다. 3단계(2026-08-29)에서
                             # Dashboard의 "EC2 Resources" 위젯을 "API Resources (ECS)"/
                             # "Game Resources (EC2)"로 분리했다 - API가 ECS로 전환된 뒤 EC2
                             # CPU/Memory는 더 이상 API를 반영하지 않기 때문이다. ECS Task
                             # 개수 지표(RunningTaskCount 등)는 Container Insights 비용
                             # 때문에 아직 도입하지 않았다 - desired_count=1 고정(오토스케일링은
                             # 6단계)이라 이미 있는 api_ecs_no_healthy_hosts 알람으로 충분하다고
                             # 판단했다. 4단계(2026-08-29)에서 alarms.tf에 game_ecs 알람(api_ecs와
                             # 동일한 패턴 - UnhealthyHost/Target5xx/NoHealthyHosts/CPU/Memory)만
                             # 추가했다 - Dashboard의 EC2/ECS 위젯 분리는 이번 범위에서는 하지
                             # 않았다(사용자 요청, 3단계 수준 관측 정리는 별도 단계로 미룸).
    ├── notification/       # CloudWatch Alarm(SongQuiz-Prod-*) 상태변화 -> EventBridge -> Lambda
    │                        # (apps/lambda/alarm-notifier) -> Slack Incoming Webhook. monitoring의
    │                        # 개별 Alarm 리소스를 직접 참조하지 않고 alarm 이름 prefix로만 연결된다
    ├── finops/             # 계정 청구(Billing) 단위 FinOps 리소스 - Monthly Budget(실제/예상
    │                        # 비용 임계치 이메일 알림) + Cost Anomaly Detection(계정 전체 서비스
    │                        # 비용 1개 Monitor). Lambda가 없는 순수 AWS Billing 리소스라 다른
    │                        # 모듈 output을 참조하지 않는 독립 모듈이다 (2026-08-28 도입)
    ├── cost-reporter/      # 매일 EventBridge Scheduler(10:00 Asia/Seoul) -> Lambda
    │                        # (apps/lambda/cost-reporter)가 Cost Explorer 비용을 조회해 Slack
    │                        # Incoming Webhook으로 전달한다 - notification과 동일한 Webhook을
    │                        # 재사용하지만 EventBridge Rule이 아니라 Scheduler로 트리거되는
    │                        # 점이 다르다 (2026-08-28 도입)
    ├── ecr/                # apps/api, apps/game 컨테이너 이미지를 저장할 ECR 리포지토리 2개
    │                        # + 수명주기 정책. ECS Fargate 이관 1단계
    │                        # (docs/infra/ecs-fargate-migration-plan.md) 산출물 - 다른 모듈의
    │                        # output을 참조하지 않는 독립 모듈이다. CI가 이 리포지토리에 이미지를
    │                        # push할 때 assume하는 IAM Role은 environments/bootstrap/ecr-push.tf에
    │                        # 별도로 있다(다른 root state라 module output을 공유할 수 없어
    │                        # project_name으로 ARN을 직접 구성 - ci_deploy_metadata와 동일한 이유)
    │                        # (2026-08-28 도입)
    └── ecs/                # ECS 클러스터(api/game 공용) + apps/api 태스크 정의/서비스(main.tf).
                             # ECS Fargate 이관 2단계 산출물(2026-08-28). 시크릿(DB_PASSWORD,
                             # JWT 시크릿 등)은 이 모듈이 만들지 않는다 -
                             # environments/prod/secrets.tf가 SSM Parameter Store(SecureString)로
                             # 만들고, 이 모듈과 iam 모듈 양쪽에 ARN을 나눠 전달한다(두 모듈이
                             # 서로 참조하면 순환 참조가 생기기 때문 - secrets.tf 주석 참고).
                             # 3단계(2026-08-29)에서 api Task Definition에 aws-otel-collector
                             # 사이드카(essential=false)를 추가했다 - EC2의 CloudWatch Agent가
                             # 하던 OTLP(localhost:4318) 수신 -> X-Ray export 역할을 같은 Task
                             # 안에서 대신한다. 이 때문에 api_task_cpu/api_task_memory 기본값도
                             # 256/512에서 512/1024로 올렸다(사이드카 몫 128 CPU/256MiB 포함).
                             # CI 배포 자동화(ECR push -> Task Definition 새 리비전 ->
                             # ecs update-service)는 .github/workflows/deploy-api.yml이 맡고,
                             # 그 workflow가 assume하는 IAM Role은 (ecr 모듈의 ecr-push.tf와
                             # 동일한 이유로) environments/bootstrap/ecs-deploy.tf에 별도로 있다.
                             #
                             # apps/game 태스크 정의/서비스(game.tf)는 4단계(2026-08-29)에서
                             # 추가했다 - api 패턴을 그대로 따르되 OTel 사이드카는 이번 범위에
                             # 넣지 않았다(트레이싱 비활성 상태로 시작, ARCHITECTURE.md
                             # Observability 참고). game은 AWS SDK를 직접 쓰지 않아 Task Role이
                             # 없다(task_role_arn을 null로 생략 가능하게 변수를 nullable로
                             # 만들었다). CI 배포는 .github/workflows/deploy-game.yml +
                             # environments/bootstrap/ecs-deploy-game.tf(별도 OIDC Role -
                             # "Deploy Game" workflow 전용, ecs-deploy.tf의 api 전용 Role과는
                             # workflow 조건이 달라 재사용할 수 없다).
                             #
                             # autoscaling.tf는 5단계(Auto Scaling, 2026-08-29)에서 추가했다 -
                             # api/game 각각 aws_appautoscaling_target + CPU/Memory
                             # aws_appautoscaling_policy(TargetTrackingScaling) 2개씩. api/game
                             # 두 aws_ecs_service 리소스(main.tf/game.tf)에는
                             # lifecycle.ignore_changes = [desired_count]를 추가해서, Auto
                             # Scaling이 조정한 태스크 수를 다음 terraform apply가 고정값으로
                             # 되돌리지 않게 했다(apps/lambda의 CI 배포와 동일한 종류의 충돌
                             # 방지 - apps/lambda/CLAUDE.md 참고). max_capacity는 api/game 모두
                             # 3으로 시작한다 - api는 Task당 TypeORM 기본 connection pool(10)을
                             # 그대로 쓰므로 RDS db.t3.micro의 max_connections(약 85)에 여유를
                             # 두기 위함이다.
```

새 환경(예: staging)이 필요해지면 `environments/<env>/`를 추가하고 같은 모듈들을
다른 변수 값으로 호출한다. 모듈 자체는 손대지 않는 것이 원칙이다.

새 리소스를 추가할 때는 기존 리소스와 책임이 가장 가까운 모듈에 넣고, 완전히 새로운
책임 영역이면 새 모듈을 만든다. 모듈 하나에 파일이 많아지면 (원래 루트에서 하던 것처럼)
`variables.tf`/`outputs.tf`는 이미 분리되어 있으니, `main.tf`만 리소스 종류별로
쪼개면 된다 (예: `modules/compute/bastion.tf`, `modules/compute/app.tf`).

`modules/`를 다시 없애고 단일 루트로 되돌리는 것도 언제든 가능하다 - 이 구조가
과하다고 느껴지면 알려달라.

## Resource Creation

Build infrastructure incrementally.

Prefer working in dependency order, for example:

```text
VPC
→ Subnets
→ Route Tables / Internet Gateway
→ Security Groups
→ Compute / Load Balancer
→ Database
→ DNS
```

Do not create the entire infrastructure in a single large change.

After completing each logical infrastructure layer:

1. format
2. validate
3. review
4. plan when appropriate

Then continue to the next layer.

## Existing Infrastructure

Do not assume that an AWS resource should be recreated if it already exists.

When existing AWS infrastructure is involved, first determine whether the correct approach is:

* Terraform-managed creation
* data source reference
* Terraform import
* leaving the resource unmanaged

Explain the tradeoff before choosing.

## Version Management

Declare required Terraform and provider versions explicitly.

Do not upgrade Terraform or provider major versions automatically.

When changing versions:

1. explain why
2. identify possible breaking changes
3. update intentionally

Keep the Terraform dependency lock file under version control.

## Communication

When I ask to create infrastructure, do not immediately generate every resource.

First explain the next logical Terraform step.

For each important resource, explain the relationship between:

```text
Terraform configuration
→ AWS resource
→ dependency on other resources
```

When multiple valid Terraform approaches exist, present the main tradeoffs and recommend one rather than silently choosing.