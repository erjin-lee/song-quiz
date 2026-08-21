#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 1

pass=0
total=0
BASELINE_LINES=1474

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

echo "== 005-split-room-service-spec =="

check "room-reconnect.spec.ts 파일이 생성됨" \
  test -f apps/api/src/room/room-reconnect.spec.ts

if [ -f apps/api/src/room/room.service.spec.ts ]; then
  current_lines=$(wc -l < apps/api/src/room/room.service.spec.ts | tr -d ' ')
else
  current_lines=0
fi
total=$((total + 1))
if [ "$current_lines" -lt "$BASELINE_LINES" ]; then
  echo "  PASS - room.service.spec.ts 줄 수 감소 (${current_lines} < ${BASELINE_LINES})"
  pass=$((pass + 1))
else
  echo "  FAIL - room.service.spec.ts 줄 수가 줄지 않음 (${current_lines} >= ${BASELINE_LINES})"
fi

check "apps/api test" yarn workspace api test
check "apps/api build" yarn workspace api build

echo "$pass/$total checks passed"
echo "수동 확인 필요: git diff로 it()/test() 총 개수와 assertion 내용이 분리 전후 동일한지 확인할 것"
[ "$pass" -eq "$total" ]
