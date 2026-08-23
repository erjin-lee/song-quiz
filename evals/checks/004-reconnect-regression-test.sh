#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 1

pass=0
total=0

check() {
  local desc="$1"; shift
  total=$((total + 1))
  if "$@"; then
    echo "  PASS - $desc"
    pass=$((pass + 1))
  else
    echo "  FAIL - $desc"
  fi
}

echo "== 004-reconnect-regression-test =="

check "apps/game test" yarn workspace game test
check "ADR-0001 / 재접속 문구가 spec에 포함됨" \
  grep -qiE 'ADR-0001|재접속' apps/game/src/room/room.service.spec.ts

echo "$pass/$total checks passed"
echo "수동 확인 필요: git diff로 it()/test() 블록이 실제로 늘었는지, ADR-0001 시나리오를 검증하는지 확인할 것"
[ "$pass" -eq "$total" ]
