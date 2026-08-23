#!/usr/bin/env bash
# Bastion을 경유해 WAS(app_a) 인스턴스에 바로 SSH 접속한다.
set -euo pipefail
cd "$(dirname "$0")/.."

SSH_KEY="${SSH_KEY:-$HOME/.ssh/deploy-terraform-bastion}"
BASTION_IP=$(terraform output -raw bastion_public_ip)
WAS_IP=$(terraform output -raw app_a_private_ip)

exec ssh -i "$SSH_KEY" \
  -o StrictHostKeyChecking=accept-new \
  -o ProxyCommand="ssh -i ${SSH_KEY} -o StrictHostKeyChecking=accept-new -W %h:%p ec2-user@${BASTION_IP}" \
  ubuntu@"$WAS_IP"