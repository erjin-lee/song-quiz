# Agent Evals

song-quiz 저장소에서 AI 코딩 에이전트(Claude Code 등)가 실제 작업을 얼마나 정확하고
효율적으로 수행하는지 측정하기 위한 대표 task 모음이다. 문서/구조 품질이 아니라
**agent task 성공률 자체**를 추적하는 것이 목적이다.

## 왜 필요한가

CLAUDE.md·ARCHITECTURE.md·ADR을 아무리 잘 정리해도 "실제로 agent가 이걸 읽고 올바르게
작업하는가"는 별도로 측정하지 않으면 알 수 없다. 여기 있는 task들은 이 저장소의 실제
코드 경로(room 재접속, DTO 수동 미러링, god file)를 기반으로 하며, 문서 개선의
효과를 before/after로 비교하는 데 쓴다.

## 디렉터리 구조

```
evals/
├── README.md          # 이 문서
├── tasks/              # task별 prompt + acceptance criteria (사람이 읽는 문서)
├── checks/              # task별 자동 검증 스크립트 (build/test/lint/grep 기반)
├── run.sh              # 지정한 task의 checks/를 실행하고 PASS/FAIL 출력
├── record.py            # 실행 결과 + 수동 지표를 results/agent-results.json에 기록
└── results/
    └── agent-results.json   # 누적 실행 로그 (JSON array, append-only)
```

## 사용 방법

1. `evals/tasks/`에서 task 하나를 고른다 (예: `001-rooms-pagination.md`).
2. 해당 task 파일의 "Prompt" 절 내용을 그대로 Claude Code에게 지시한다. 별도
   컨텍스트를 추가로 주지 않는다 — CLAUDE.md, ARCHITECTURE.md, ADR만으로
   agent가 올바른 결정을 내릴 수 있는지가 측정 대상이다.
3. agent 작업이 끝나면 자동 검증을 실행한다.
   ```bash
   evals/run.sh 001-rooms-pagination
   ```
   빌드/테스트/lint와 task별 grep 기반 체크를 수행하고 PASS/FAIL을 출력한다.
4. 결과와 수동 지표(투입한 tool call 수, 대략적 토큰 사용량 — Claude Code 세션
   요약에서 확인, 소요 시간, 추가 질문 여부)를 기록한다.
   ```bash
   python3 evals/record.py \
     --task 001-rooms-pagination \
     --model claude-sonnet-5 \
     --outcome pass \
     --tool-calls 14 \
     --wall-clock-min 6 \
     --human-clarifications 0 \
     --notes "1회 시도로 통과"
   ```
   플래그를 생략하면 대화형으로 입력받는다.
5. 여러 번 반복해 `evals/results/agent-results.json`에 기록이 쌓이면 task별/시기별
   pass rate를 비교할 수 있다.

## Task 목록

| ID | 영역 | 난이도 | 측정 대상 |
|----|------|--------|-----------|
| [001-rooms-pagination](tasks/001-rooms-pagination.md) | apps/api | S | 기존 패턴(admin 쿼리 DTO) 재사용 능력 |
| [002-inquiry-upd-dt-mirror](tasks/002-inquiry-upd-dt-mirror.md) | apps/api ↔ apps/admin | S | ADR-0003(DTO 수동 미러링) tribal knowledge 준수 |
| [003-room-list-refresh-button](tasks/003-room-list-refresh-button.md) | apps/web | S | 기존 컴포넌트 관례를 따른 프런트엔드 변경 |
| [004-reconnect-regression-test](tasks/004-reconnect-regression-test.md) | apps/api | M | ADR-0001 문맥을 읽고 회귀 테스트를 작성하는 능력 |
| [005-split-room-service-spec](tasks/005-split-room-service-spec.md) | apps/api | M | god file(1474줄)을 로직 변경 없이 안전하게 리팩터링하는 능력 |

## 결과 스키마

`evals/results/agent-results.json`의 각 항목:

```json
{
  "date": "2026-08-21",
  "task_id": "001-rooms-pagination",
  "model": "claude-sonnet-5",
  "outcome": "pass",
  "auto_checks": { "passed": 4, "total": 4 },
  "manual": {
    "tool_calls": 14,
    "wall_clock_min": 6,
    "human_clarifications": 0
  },
  "notes": "1회 시도로 통과"
}
```

- `outcome`: `pass` / `fail` / `partial`
- `tool_calls` / `wall_clock_min`: Claude Code 세션 요약이나 터미널 타임스탬프로
  대략 추정한 값. 정밀 계측이 아니라 추세 비교용이다.
- `human_clarifications`: agent가 작업 중 사람에게 추가로 확인을 요청한 횟수.

## Task 추가 규칙

- 새 task는 이 저장소에 실제로 존재하는 코드/패턴을 기반으로 한다 — 가상의
  파일이나 존재하지 않는 필드를 참조하지 않는다.
- acceptance criteria는 가능한 한 `evals/checks/<task-id>.sh`로 자동 검증
  가능하게 만든다 (build/test/lint 통과, 특정 파일 존재, 특정 패턴 grep).
  자동화가 불가능한 기준(디자인 품질 등)은 task 문서에 "수동 검토" 항목으로
  명시한다.
