#!/usr/bin/env bash
# tunnel-db.sh, tunnel-was.sh, tunnel-redis.sh를 함께 실행한다.
# 셋 중 하나가 끝나거나(Ctrl+C, 에러 등) 스크립트가 종료되면 나머지도 함께 종료된다.
# 로컬 포트는 git에 올리지 않는 scripts/.env.local에서 읽는다(scripts/.env.local.example 참고).
# 인자로 직접 넘기면 그 값이 우선한다.
# 사용법: scripts/tunnel-all.sh [DB 로컬 포트] [WAS 로컬 포트] [Redis 로컬 포트]
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f scripts/.env.local ] && . scripts/.env.local

DB_LOCAL_PORT="${1:-${DB_LOCAL_PORT:?DB_LOCAL_PORT가 설정되지 않았습니다. scripts/.env.local에 설정하거나 인자로 전달하세요(scripts/.env.local.example 참고).}}"
WAS_LOCAL_PORT="${2:-${WAS_LOCAL_PORT:?WAS_LOCAL_PORT가 설정되지 않았습니다. scripts/.env.local에 설정하거나 인자로 전달하세요(scripts/.env.local.example 참고).}}"
REDIS_LOCAL_PORT="${3:-${REDIS_LOCAL_PORT:?REDIS_LOCAL_PORT가 설정되지 않았습니다. scripts/.env.local에 설정하거나 인자로 전달하세요(scripts/.env.local.example 참고).}}"

PIDS=()

cleanup() {
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

./scripts/tunnel-db.sh "$DB_LOCAL_PORT" &
PIDS+=("$!")

./scripts/tunnel-was.sh "$WAS_LOCAL_PORT" &
PIDS+=("$!")

./scripts/tunnel-redis.sh "$REDIS_LOCAL_PORT" &
PIDS+=("$!")

echo "DB 터널(localhost:${DB_LOCAL_PORT}), WAS 터널(localhost:${WAS_LOCAL_PORT}), Redis 터널(localhost:${REDIS_LOCAL_PORT}) 실행 중. 종료하려면 Ctrl+C"

# 셋 중 하나라도 끝나면 즉시 빠져나와서 trap이 나머지를 정리하게 한다.
# (wait -n은 bash 4.3+ 전용이라, sh/구버전 bash에서도 동작하도록 폴링으로 대체)
while true; do
  for pid in "${PIDS[@]}"; do
    if ! kill -0 "$pid" 2>/dev/null; then
      exit 0
    fi
  done
  sleep 1
done