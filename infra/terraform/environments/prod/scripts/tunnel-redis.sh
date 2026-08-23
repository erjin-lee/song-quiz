#!/usr/bin/env bash
# 로컬 포트를 ElastiCache(Redis)로 포워딩한다. sg_cache가 sg_app(WAS)에서만 접근을 허용하므로
# bastion -> WAS 2단 홉(ProxyJump)을 거쳐서 연결한다.
# 로컬 포트는 git에 올리지 않는 scripts/.env.local의 REDIS_LOCAL_PORT로 설정한다
# (scripts/.env.local.example 참고). 인자로 직접 넘기면 그 값이 우선한다.
# 사용법: scripts/tunnel-redis.sh [로컬 포트]
#   이후 다른 터미널에서: redis-cli -h 127.0.0.1 -p <로컬 포트>
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f scripts/.env.local ] && . scripts/.env.local

SSH_KEY="${SSH_KEY:-$HOME/.ssh/deploy-terraform-bastion}"
LOCAL_PORT="${1:-${REDIS_LOCAL_PORT:?REDIS_LOCAL_PORT가 설정되지 않았습니다. scripts/.env.local에 설정하거나 인자로 전달하세요(scripts/.env.local.example 참고).}}"
BASTION_IP=$(terraform output -raw bastion_public_ip)
WAS_IP=$(terraform output -raw app_a_private_ip)
CACHE_ENDPOINT=$(terraform output -raw cache_endpoint)
CACHE_HOST="${CACHE_ENDPOINT%:*}"
CACHE_PORT="${CACHE_ENDPOINT##*:}"

echo "localhost:${LOCAL_PORT} -> ${CACHE_HOST}:${CACHE_PORT} (Redis, bastion+WAS 경유). 종료하려면 Ctrl+C"
exec ssh -i "$SSH_KEY" \
  -o StrictHostKeyChecking=accept-new \
  -o ProxyCommand="ssh -i ${SSH_KEY} -o StrictHostKeyChecking=accept-new -W %h:%p ec2-user@${BASTION_IP}" \
  -L "${LOCAL_PORT}:${CACHE_HOST}:${CACHE_PORT}" \
  -N ubuntu@"$WAS_IP"