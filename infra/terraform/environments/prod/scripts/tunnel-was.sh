#!/usr/bin/env bash
# 로컬 포트를 bastion을 거쳐 WAS(app_a)의 22번(SSH) 포트로 포워딩한다.
# 파일 전송(scp/rsync) 등 WAS에 직접 붙는 도구가 필요할 때 사용.
# 로컬 포트는 git에 올리지 않는 scripts/.env.local의 WAS_LOCAL_PORT로 설정한다
# (scripts/.env.local.example 참고). 인자로 직접 넘기면 그 값이 우선한다.
# 사용법: scripts/tunnel-was.sh [로컬 포트]
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f scripts/.env.local ] && . scripts/.env.local

SSH_KEY="${SSH_KEY:-$HOME/.ssh/deploy-terraform-bastion}"
LOCAL_PORT="${1:-${WAS_LOCAL_PORT:?WAS_LOCAL_PORT가 설정되지 않았습니다. scripts/.env.local에 설정하거나 인자로 전달하세요(scripts/.env.local.example 참고).}}"
BASTION_IP=$(terraform output -raw bastion_public_ip)
WAS_IP=$(terraform output -raw app_a_private_ip)

echo "localhost:${LOCAL_PORT} -> ${WAS_IP}:22 (WAS SSH, bastion 경유). 종료하려면 Ctrl+C"
exec ssh -i "$SSH_KEY" \
  -o StrictHostKeyChecking=accept-new \
  -L "${LOCAL_PORT}:${WAS_IP}:22" \
  -N ec2-user@"$BASTION_IP"