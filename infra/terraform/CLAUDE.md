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
    ├── network/           # VPC, 서브넷, 라우팅
    ├── security/          # public/app/db 보안 그룹
    ├── iam/                # app 인스턴스 역할/정책
    ├── compute/           # bastion + app_a 인스턴스
    ├── load_balancer/     # ALB, 타겟그룹, 리스너
    ├── acm/                # ALB용 와일드카드 인증서
    ├── web/                # S3 + CloudFront (정적 웹)
    ├── dns/                # api/game 서브도메인 레코드
    ├── ses/                # SES 도메인 인증 + DKIM
    ├── database/          # RDS
    ├── cache/              # ElastiCache
    ├── logging/            # CloudWatch Log Group(api/game) + Game 실패 이벤트 Metric Filter
    └── monitoring/         # CloudWatch Dashboard(SongQuiz-Prod) - 다른 모듈의 output만 참조,
                             # 새 AWS 리소스(로그/지표/알람)는 만들지 않고 기존 지표를 시각화만 한다
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