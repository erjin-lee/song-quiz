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

echo "== 003-room-list-refresh-button =="

check "web build" yarn web:build
check "새로고침/refresh 관련 코드 추가" \
  grep -qiE '새로고침|refresh' apps/web/src/pages/RoomListPage.tsx
check "직접 fetch() 호출 없이 기존 api 래퍼 재사용" \
  bash -c "! grep -q 'fetch(' apps/web/src/pages/RoomListPage.tsx"

echo "$pass/$total checks passed"
[ "$pass" -eq "$total" ]
