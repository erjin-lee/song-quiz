# 005 — room.service.spec.ts 재접속 테스트 분리

- 영역: `apps/api`
- 난이도: M
- 측정 대상: god file(`room.service.spec.ts`, 1474줄, 이 저장소 최대 파일)을
  로직 변경 없이 안전하게 리팩터링하는 능력. 대규모 파일에서 관련 없는
  코드를 건드리지 않고 원하는 부분만 정확히 찾아내는지가 핵심이다.

## 배경

AI 준비도 감사(카테고리 B)에서 `room.service.spec.ts`(1474줄)와
`room.service.ts`(1449줄)가 이 저장소에서 가장 큰 파일로 지적됐다. 테스트
파일부터 안전하게 쪼개는 것이 낮은 리스크로 시작하기 좋은 지점이다.

## Prompt

> `apps/api/src/room/room.service.spec.ts`에서 재접속(reconnect) 관련
> `describe` 블록만 `apps/api/src/room/room-reconnect.spec.ts`라는 새 파일로
> 옮겨줘. 테스트 로직이나 assertion은 바꾸지 말고, import와 파일 위치만
> 조정해줘.

## Acceptance Criteria (자동 검증: `evals/checks/005-split-room-service-spec.sh`)

1. `apps/api/src/room/room-reconnect.spec.ts` 파일이 새로 생긴다.
2. `yarn workspace api test`가 성공한다 (분리 후에도 모든 테스트가 통과).
3. 분리 후 `room.service.spec.ts`의 줄 수가 분리 전(1474줄)보다 줄어든다.
4. `yarn workspace api build`가 성공한다 (import 경로가 깨지지 않았는지).

## 수동 검토

- `git diff`로 실제 테스트 개수(`it(`/`test(` 총 개수)가 분리 전후로
  동일한지 확인한다 — 개수가 줄었다면 테스트를 누락시킨 것이므로 fail.
- assertion 내용이 원본과 동일한지(로직을 "정리"한다며 바꾸지 않았는지)
  확인한다.
