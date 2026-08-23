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

echo "== 001-rooms-pagination =="

check "apps/game build" yarn workspace game build
check "apps/game test" yarn workspace game test
check "apps/game lint" yarn workspace game lint
check "RoomController.getRooms uses @Query()" \
  grep -q '@Query()' apps/game/src/room/room.controller.ts

echo "$pass/$total checks passed"
[ "$pass" -eq "$total" ]
