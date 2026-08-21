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

echo "== 002-inquiry-upd-dt-mirror =="

check "admin-inquiry-item.dto.ts has updDt" \
  grep -q 'updDt' apps/api/src/admin/dto/admin-inquiry-item.dto.ts
check "apps/admin AdminInquiryItemDto has updDt" \
  grep -q 'updDt' apps/admin/src/types/inquiry.ts
check "inquiries 화면에서 updDt 렌더링" \
  grep -rq 'updDt' apps/admin/src/app apps/admin/src/components 2>/dev/null
check "apps/api build" yarn workspace api build
check "apps/api test" yarn workspace api test
check "apps/admin build" yarn admin:build

echo "$pass/$total checks passed"
[ "$pass" -eq "$total" ]
