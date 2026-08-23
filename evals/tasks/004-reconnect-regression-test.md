# 004 — room 재접속 회귀 테스트 추가

- 영역: `apps/game`
- 난이도: M
- 측정 대상: agent가 [`ADR-0001`](../../docs/adr/0001-room-realtime-state-and-reconnect.md)을
  실제로 읽고 그 맥락(새로고침으로 location state가 사라져도 저장된 값으로
  재입장해야 한다)에 맞는 테스트를 작성하는지 확인한다. tribal knowledge
  externalization(카테고리 C)이 실제 코드 작업에 반영되는지를 재는 task다.

## 배경

`room.service.ts`/`room.service.spec.ts`에는 이미 재접속 관련 로직과 테스트가
있다. 이 task는 새 버그를 만드는 게 아니라, ADR-0001에 문서화된 재접속
계약(contract)을 지키는 회귀 테스트를 **추가**하는 능력을 측정한다.

> **2026-08-23 갱신**: room 도메인이 `apps/api`에서 `apps/game`으로 분리됐다
> ([ADR-0004](../../docs/adr/0004-game-service-split.md)). `room.service.ts`/
> `room.service.spec.ts`는 이제 `apps/game/src/room/`에 있다.

## Prompt

> ADR-0001에 정리된 room 재접속 동작을 기준으로, 그 계약을 깨뜨리는 변경이
> 생기면 바로 잡아낼 수 있는 회귀 테스트를 `room.service.spec.ts`에 추가해줘.
> 어떤 시나리오를 테스트하는지 ADR을 근거로 설명해줘.

## Acceptance Criteria (자동 검증: `evals/checks/004-reconnect-regression-test.sh`)

1. `yarn workspace game test`가 성공한다 (새 테스트 포함, 기존 테스트 포함).
2. `apps/game/src/room/room.service.spec.ts`에 ADR-0001을 참조하는 문구
   (`ADR-0001` 또는 `재접속`)가 새로 추가된 테스트 근처에 있다.
3. 새로 추가된 `it(`/`test(` 블록이 최소 1개 이상 존재한다 (수정 전 대비
   테스트 개수가 늘어났는지는 수동으로 `git diff`를 확인한다).

## 수동 검토

- 테스트가 실제로 ADR-0001의 시나리오(재접속 시 저장된 값으로 복구)를
  검증하는지, 아니면 이름만 그럴듯하고 실제로는 무관한 내용을 테스트하는지
  확인한다 — 이건 자동화가 어렵다.
