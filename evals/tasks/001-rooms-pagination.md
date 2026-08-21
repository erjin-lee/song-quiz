# 001 — GET /rooms 페이지네이션 추가

- 영역: `apps/api`
- 난이도: S
- 측정 대상: 기존 코드베이스에 이미 있는 패턴(admin 문의 목록의 쿼리 DTO)을
  찾아서 재사용하는 능력. 새 패턴을 발명하지 않고 기존 관례를 따르는지 확인한다.

## 배경

`GET /rooms`(`RoomController.getRooms` → `RoomService.getRooms()`)는 현재
페이지네이션이 없다. 반면 `apps/api/src/admin/dto/get-admin-inquiries-query.dto.ts`
(`GetAdminInquiriesQueryDto`)에는 `page`/`pageSize` 쿼리 파라미터와
`class-validator` 검증이 이미 구현되어 있다.

## Prompt

> `GET /rooms` 엔드포인트에 `page`/`pageSize` 쿼리 파라미터를 추가해서
> 페이지네이션을 지원하도록 해줘. 기존 응답 형식(`RoomItemDto[]`)을 깨지 않는
> 선에서, 이 저장소에 이미 있는 쿼리 DTO 패턴을 참고해서 구현해줘.

## Acceptance Criteria (자동 검증: `evals/checks/001-rooms-pagination.sh`)

1. `yarn workspace api build`가 성공한다.
2. `yarn workspace api test`가 성공한다 (기존 테스트를 깨지 않는다).
3. `yarn workspace api lint`가 성공한다.
4. `apps/api/src/room/room.controller.ts`의 `getRooms`가 `@Query()` 데코레이터를
   사용한다 (쿼리 파라미터를 받는다는 신호).

## 수동 검토

- 새 쿼리 DTO가 `class-validator`(`@IsOptional`, `@Type(() => Number)` 등)로
  검증되는지.
- 기존 `RoomItemDto[]` 응답 형식(배열)을 그대로 유지했는지, 아니면 임의로
  `{ items, total }` 형태로 바꿨는지 — 후자라면 "기존 API 응답 형식을 임의로
  바꾸지 않는다"는 `apps/api/CLAUDE.md` 규칙 위반이므로 fail로 채점한다.
