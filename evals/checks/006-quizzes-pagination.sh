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

echo "== 006-quizzes-pagination =="

check "apps/api build" yarn workspace api build
check "apps/api test" yarn workspace api test
check "apps/api lint" yarn workspace api lint
check "GetQuizzesQueryDto에 pageSize 필드가 추가됨" \
  grep -q 'pageSize' apps/api/src/quiz/dto/get-quizzes-query.dto.ts

echo "$pass/$total checks passed"
echo "수동 확인 필요: 응답 형식(QuizListItemDto[]) 유지 여부, page/pageSize 생략 시 기존 동작 유지 여부, 캐시 키 설계"
[ "$pass" -eq "$total" ]
