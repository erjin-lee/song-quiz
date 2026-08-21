#!/usr/bin/env bash
# 지정한 eval task의 자동 검증 스크립트를 실행한다.
# 사용법: evals/run.sh <task-id>   (예: evals/run.sh 001-rooms-pagination)
set -uo pipefail
cd "$(dirname "$0")" || exit 1

task_id="${1:-}"
if [ -z "$task_id" ]; then
  echo "사용법: evals/run.sh <task-id>"
  echo ""
  echo "사용 가능한 task:"
  ls tasks | sed 's/\.md$//' | sed 's/^/  /'
  exit 1
fi

check_script="checks/${task_id}.sh"
if [ ! -f "$check_script" ]; then
  echo "checks/${task_id}.sh 가 없다. tasks/${task_id}.md 는 존재하는지 확인할 것."
  exit 1
fi

bash "$check_script"
