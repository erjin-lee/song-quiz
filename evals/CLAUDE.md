# Agent evals (evals/)

# Purpose

AI 코딩 에이전트가 이 저장소에서 실제로 얼마나 정확·효율적으로 작업하는지
측정하는 task/검증 스크립트/결과 로그를 소유한다. 사용법 전체는
[`README.md`](README.md) 참고.

# Patterns

- 새 task 추가: `tasks/001-rooms-pagination.md` 같은 기존 파일을 복제해
  prompt + acceptance criteria를 쓰고, 짝이 되는
  `checks/001-rooms-pagination.sh`를 만든다.
- task 실행: `run.sh <task-id>`로 자동 검증 → `record.py`로 결과를
  `results/agent-results.json`에 append.

# Dependencies

- 각 `checks/*.sh`는 `apps/api`/`apps/game`/`apps/web`/`apps/admin`의 실제
  build/test/lint 명령을 호출한다. 앱별 명령이 바뀌면(각 앱
  `CLAUDE.md`의 Commands 절) 관련 `checks/*.sh`도 함께 갱신한다.
- tribal knowledge 근거는 [`docs/adr/`](../docs/adr/README.md)를 따른다.

# Commands

```bash
run.sh 001-rooms-pagination
```

# Verification

- Why: task는 가상 시나리오가 아니라 이 저장소의 실제 파일·패턴을
  참조한다 — 문서화된 관례를 agent가 실제로 찾아 따르는지가 측정
  대상이기 때문이다.
- Gotcha: `checks/*.sh`는 `yarn workspace api build/test/lint`처럼 느린
  명령을 그대로 실행한다. 여러 task를 연달아 돌리면 시간이 걸린다.
