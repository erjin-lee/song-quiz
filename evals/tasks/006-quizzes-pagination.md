# 006 — GET /quizzes 페이지네이션 추가

- 영역: `apps/api`
- 난이도: S
- 측정 대상: 기존 코드베이스에 이미 있는 패턴(페이지네이션 쿼리 DTO)을 찾아서
  재사용하는 능력. 새 패턴을 발명하지 않고 기존 관례를 따르는지 확인한다.
  [001-rooms-pagination](001-rooms-pagination.md)(완료·retired)과 같은 능력을
  다른(아직 미구현인) 대상으로 다시 측정하기 위한 후속 task다.

## 배경

`GET /quizzes`(`QuizController.getQuizzes` → `QuizService.getQuizzes()`)는
현재 페이지네이션이 없다(`GetQuizzesQueryDto`에는 `keyword`/`searchType`만
있음). 반면 이 저장소에는 이미 같은 패턴의 실제 예시가 두 곳 있다:

- `apps/api/src/admin/dto/get-admin-inquiries-query.dto.ts`(`GetAdminInquiriesQueryDto`)
- `apps/game/src/room/dto/get-rooms-query.dto.ts`(`GetRoomsQueryDto`) — page/pageSize
  생략 시 전체 목록을 반환하는 하위 호환 처리까지 포함

## Prompt

> `GET /quizzes` 엔드포인트에 `page`/`pageSize` 쿼리 파라미터를 추가해서
> 페이지네이션을 지원하도록 해줘. 기존 응답 형식(`QuizListItemDto[]`)을 깨지
> 않는 선에서, 이 저장소에 이미 있는 쿼리 DTO 패턴을 참고해서 구현해줘.

## Acceptance Criteria (자동 검증: `evals/checks/006-quizzes-pagination.sh`)

1. `yarn workspace api build`가 성공한다.
2. `yarn workspace api test`가 성공한다 (기존 테스트를 깨지 않는다).
3. `yarn workspace api lint`가 성공한다.
4. `apps/api/src/quiz/dto/get-quizzes-query.dto.ts`에 `pageSize` 필드가
   추가된다 (쿼리 파라미터를 받는다는 신호).

## 수동 검토

- 새 쿼리 필드가 `class-validator`(`@IsOptional`, `@Type(() => Number)` 등)로
  검증되는지.
- 기존 `QuizListItemDto[]` 응답 형식(배열)을 그대로 유지했는지, 아니면 임의로
  `{ items, total }` 형태로 바꿨는지 — 후자라면 "기존 API 응답 형식을 임의로
  바꾸지 않는다"는 `apps/api/CLAUDE.md` 규칙 위반이므로 fail로 채점한다.
- `page`/`pageSize`를 생략했을 때 기존 동작(캐시된 전체 목록)이 그대로
  유지되는지 — `QuizService.getQuizzes`의 60초 캐시(`quiz:list:*`)와 조합했을
  때 캐시 키 설계가 페이지별로 꼬이지 않는지 확인한다.
