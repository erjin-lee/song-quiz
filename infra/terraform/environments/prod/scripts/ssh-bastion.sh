#!/usr/bin/env bash
# Bastion 인스턴스에 바로 SSH 접속한다.
set -euo pipefail
cd "$(dirname "$0")/.."

SSH_KEY="${SSH_KEY:-$HOME/.ssh/deploy-terraform-bastion}"
BASTION_IP=$(terraform output -raw bastion_public_ip)

exec ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new ec2-user@"$BASTION_IP"