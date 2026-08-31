#!/usr/bin/env bash
# 로컬 포트를 RDS(3306)로 포워딩한다. bastion에서 DB로 직접 접속한다(modules/security의
# db SG가 bastion SG를 허용 - "DB port from bastion" 규칙). 예전에는 sg_db가 sg_app(WAS)
# 에서만 접근을 허용해서 bastion -> WAS 2단 홉(ProxyJump)을 거쳤지만, ECS Fargate 이관
# 이후 WAS 역할이던 app_a EC2가 정지 상태라(2026-08-29) 그 경로가 끊겼다 - app_a를 매번
# 켜지 않아도 되도록 bastion 단일 홉으로 바꿨다.
# 로컬 포트는 git에 올리지 않는 scripts/.env.local의 DB_LOCAL_PORT로 설정한다
# (scripts/.env.local.example 참고). 인자로 직접 넘기면 그 값이 우선한다.
# 사용법: scripts/tunnel-db.sh [로컬 포트]
#   이후 다른 터미널에서: mysql -h 127.0.0.1 -P <로컬 포트> -u <username> -p
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f scripts/.env.local ] && . scripts/.env.local

SSH_KEY="${SSH_KEY:-$HOME/.ssh/deploy-terraform-bastion}"
LOCAL_PORT="${1:-${DB_LOCAL_PORT:?DB_LOCAL_PORT가 설정되지 않았습니다. scripts/.env.local에 설정하거나 인자로 전달하세요(scripts/.env.local.example 참고).}}"
BASTION_IP=$(terraform output -raw bastion_public_ip)
DB_ENDPOINT=$(terraform output -raw db_endpoint)
DB_HOST="${DB_ENDPOINT%:*}"
DB_PORT="${DB_ENDPOINT##*:}"

echo "localhost:${LOCAL_PORT} -> ${DB_HOST}:${DB_PORT} (RDS, bastion 경유). 종료하려면 Ctrl+C"
exec ssh -i "$SSH_KEY" \
  -o StrictHostKeyChecking=accept-new \
  -L "${LOCAL_PORT}:${DB_HOST}:${DB_PORT}" \
  -N ec2-user@"$BASTION_IP"