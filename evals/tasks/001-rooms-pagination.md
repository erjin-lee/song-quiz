# 001 — GET /rooms 페이지네이션 추가

> **상태: 완료(retired) — 2026-08-23**
> `evals/results/agent-results.json`에 2026-08-21 실행 기록(4/4 PASS)이 남아있듯,
> 이 task는 이미 실제 agent 실행으로 통과됐고 그 결과(`GetRoomsQueryDto`)가
> 코드베이스에 그대로 남아 있다. 이제는 아무 작업 없이도 아래 체크가 전부
> PASS하므로 더 이상 유효한 측정 도구가 아니다 — 다시 돌리지 말 것.
> 같은 능력(기존 페이지네이션 DTO 패턴 재사용)을 계속 측정하려면
> [006-quizzes-pagination](006-quizzes-pagination.md)을 대신 사용한다.
> 이 파일은 과거 실행 기록의 맥락을 보존하기 위해 남겨둔다.

- 영역: `apps/game`(패턴 참고 대상은 `apps/api`)
- 난이도: S
- 측정 대상: 기존 코드베이스에 이미 있는 패턴(admin 문의 목록의 쿼리 DTO)을
  찾아서 재사용하는 능력. 새 패턴을 발명하지 않고 기존 관례를 따르는지 확인한다.

## 배경

`GET /rooms`(`RoomController.getRooms` → `RoomService.getRooms()`)는 현재
페이지네이션이 없다. 반면 `apps/api/src/admin/dto/get-admin-inquiries-query.dto.ts`
(`GetAdminInquiriesQueryDto`)에는 `page`/`pageSize` 쿼리 파라미터와
`class-validator` 검증이 이미 구현되어 있다.

> **2026-08-23 갱신**: room 도메인이 `apps/api`에서 `apps/game`으로 분리됐다
> ([ADR-0004](../../docs/adr/0004-game-service-split.md)). `RoomController`/
> `RoomService`는 이제 `apps/game`에 있고, 패턴 참고 대상(`GetAdminInquiriesQueryDto`)만
> `apps/api`에 남아 있다 — agent가 서로 다른 두 앱에 걸쳐 패턴을 찾아 적용해야 한다.

## Prompt

> `GET /rooms` 엔드포인트에 `page`/`pageSize` 쿼리 파라미터를 추가해서
> 페이지네이션을 지원하도록 해줘. 기존 응답 형식(`RoomItemDto[]`)을 깨지 않는
> 선에서, 이 저장소에 이미 있는 쿼리 DTO 패턴을 참고해서 구현해줘.

## Acceptance Criteria (자동 검증: `evals/checks/001-rooms-pagination.sh`)

1. `yarn workspace game build`가 성공한다.
2. `yarn workspace game test`가 성공한다 (기존 테스트를 깨지 않는다).
3. `yarn workspace game lint`가 성공한다.
4. `apps/game/src/room/room.controller.ts`의 `getRooms`가 `@Query()` 데코레이터를
   사용한다 (쿼리 파라미터를 받는다는 신호).

## 수동 검토

- 새 쿼리 DTO가 `class-validator`(`@IsOptional`, `@Type(() => Number)` 등)로
  검증되는지.
- 기존 `RoomItemDto[]` 응답 형식(배열)을 그대로 유지했는지, 아니면 임의로
  `{ items, total }` 형태로 바꿨는지 — 후자라면 "기존 API 응답 형식을 임의로
  바꾸지 않는다"는 `apps/api/CLAUDE.md` 규칙 위반이므로 fail로 채점한다.
