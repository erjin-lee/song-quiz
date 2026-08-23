# ADR-0004: Room을 별도 서비스(apps/game)로 분리

- 상태: Accepted
- 관련 코드: `apps/game/src/room/**`, `apps/api/src/quiz/internal/**`, `apps/api/src/user/internal/**`, `apps/api/src/inquiry/game-notifier.client.ts`, `apps/game/src/room/clients/**`, `apps/api/src/common/internal-auth.guard.ts`, `apps/game/src/common/internal-auth.guard.ts`

## 배경

`apps/api` 하나가 일반 REST API(퀴즈/유저/문의/관리자)와 실시간 게임 서버(room, Socket.IO)를 함께 서비스했다. 두 축은 스케일링·배포 특성이 다르다 — room은 Redis 기반 상태·분산 락·타이머·Socket.IO 커넥션을 오래 유지해야 하고, 나머지 REST API는 상대적으로 stateless하다. 하나의 프로세스/배포 단위로 묶여 있으면 room 트래픽 증가에 대응해 인스턴스를 늘릴 때 관련 없는 REST API까지 함께 스케일되고, 배포도 항상 같이 나간다.

room은 `quiz`(퀴즈/출제곡/정답 조회, `playCnt` 증가)와 `user`(로그인 유저 식별)에 의존했고, 반대로 `inquiry`는 문의 처리 결과를 소켓으로 알리기 위해 `room`(정확히는 `RoomGateway`)에 의존했다. 서비스를 분리하려면 이 결합을 먼저 풀어야 했다.

## 결정

1. `apps/game`을 새 NestJS 애플리케이션으로 만들고, `apps/api/src/room/**` 전체(REST 컨트롤러, Socket.IO 게이트웨이, 서비스, 분산 락, 타이머, DTO)를 그대로 옮긴다. `/rooms` REST 경로와 Socket.IO 이벤트명/payload는 바꾸지 않는다.
2. `apps/game`은 Quiz/User TypeORM Repository나 Entity를 직접 참조하지 않는다. 대신 `apps/api`가 `/internal/quizzes/*`, `/internal/auth/*` 아래 내부 전용 HTTP 엔드포인트를 노출하고, `apps/game`은 `QuizClient`/`AuthClient`(내장 `fetch` 기반)로 그 엔드포인트를 호출한다.
3. 게임 시작 시(`RoomService.startGame`/`restartGame`) 그 퀴즈의 전체 라운드 데이터(곡 정보, 정답)를 `QuizClient.getQuizRounds(quizId)`로 한 번에 스냅샷으로 받아, 게임 서비스가 셔플/슬라이스(songLimit 반영)한 뒤 Redis(`room:rounds:<roomId>`)에 캐시해두고, 라운드가 진행되는 동안에는 apps/api를 다시 호출하지 않는다. 처음에는 곡 목록 조회(`song-ids`)와 곡별 라운드 데이터 조회(`song-rounds`, quizSongId `IN` 절)를 분리했으나, `SQ_QUIZ_SONG.QUIZ_ID`에 이미 인덱스가 있어 quizId 조건 하나로 곧장 조회하는 편이 왕복 횟수도 적고 더 단순해 하나로 합쳤다.
4. `inquiry -> room` 의존성을 반대로 뒤집는다. `apps/game`이 `/internal/rooms/inquiry-result` 엔드포인트를 노출하고, `apps/api`의 `InquiryService`는 더 이상 `RoomGateway`를 직접 import하지 않고 `GameNotifierClient`(내장 `fetch`)로 이 엔드포인트를 호출한다.
5. 서비스 간 내부 엔드포인트는 공유 시크릿 헤더(`X-Internal-Secret`, `INTERNAL_SERVICE_SECRET` env)로 보호한다. 양쪽 서비스에 대칭적인 `InternalAuthGuard`를 각각 둔다.
6. `apps/web`은 REST/Socket.IO 호출을 `VITE_API_BASE_URL`(일반 API)과 `VITE_GAME_BASE_URL`(room REST + Socket.IO)로 분리한다.

## 근거

- **내부 통신 방식(HTTP vs 메시지 큐 등)**: 이미 REST 기반 요청-응답 구조를 그대로 쓰는 것이 가장 단순했다. Kafka 등 새 인프라를 도입할 만큼 이벤트 양이 많지 않고(문의 결과 알림은 유저 1명당 최대 몇 건), room 생성/입장/게임 시작 같은 호출은 원래도 동기 요청-응답이었다.
- **스냅샷 vs 매 라운드 조회**: 초기 검토에서는 room이 필요할 때마다 apps/api를 호출하는 방식도 고려했지만, 라운드 전환마다 서비스 간 호출이 발생하면 네트워크 latency가 게임 진행 체감에 직접 영향을 준다. 게임 시작 시점에 전체 라운드 데이터를 한 번에 받아 Redis에 캐시하는 방식은 기존에 이미 Redis를 라운드 상태 저장소로 쓰고 있던 구조(ADR-0001)와도 자연스럽게 맞아떨어졌다.
- **공유 패키지 대신 내부 HTTP + 중복 코드**: ADR-0003에서 이미 "워크스페이스 3개 규모에서 공유 패키지 도입 비용이 수동 동기화 번거로움보다 크다"고 판단했다. 같은 논리로, `CacheService`/`RoomLockService`/`RoomTimerService`처럼 두 서비스가 완전히 동일하게 필요로 하는 코드도 지금은 `packages/`로 뽑지 않고 파일을 그대로 복제했다. 서비스가 더 늘어나거나 이 코드의 변경 빈도가 높아지면 재검토한다.
- **User JWT를 apps/game이 직접 검증하지 않는 이유**: `UserService.resolveOptionalAccountUserId`는 JWT 서명 검증뿐 아니라 DB에서 계정이 여전히 `ACTIVE`인지도 확인한다(정지/탈퇴 계정 차단). apps/game이 JWT 서명만 검증하면 이 동작이 조용히 달라지므로, USER_JWT_SECRET을 복제해 자체 검증하는 대신 apps/api의 `/internal/auth/resolve-account-user`를 그대로 호출해 완전히 동일한 동작을 유지했다. 다만 방 참가 접근 토큰(`computeMembershipToken`, room 자체 도메인)은 USER_JWT_SECRET을 HMAC 키로만 재사용하므로 apps/game도 이 값을 그대로 갖고 있어야 한다.

## 결과 및 트레이드오프

- 방 생성/입장, 게임 시작마다 apps/game -> apps/api 내부 HTTP 호출이 최소 1~2회 추가된다. 게임 시작은 라운드당이 아니라 게임당 1회이므로 라운드 진행 자체의 지연에는 영향이 없지만, apps/api가 느려지거나 응답 불가 상태면 방 생성/게임 시작도 함께 실패한다 — 두 서비스가 완전히 독립적이지는 않다.
- 문의 결과 알림(`GameNotifierClient.notifyInquiryResult`)은 best-effort로 설계했다(실패해도 예외를 던지지 않고 로깅만 한다) — 문의 처리 결과 자체는 이미 DB에 저장된 뒤이므로, 알림 실패가 핵심 상태를 잃게 하지는 않지만 유저가 실시간 알림을 못 받을 수 있다.
- `CacheService`/`RoomLockService`/`RoomTimerService`/로깅 미들웨어가 두 서비스에 중복 존재한다. 한쪽만 고치고 반대쪽을 놓치면 동작이 갈라질 수 있다 — 이 파일들을 고칠 때는 반드시 반대쪽도 함께 확인한다.
- `INTERNAL_SERVICE_SECRET`, `GAME_SERVICE_URL`(apps/api), `API_SERVICE_URL`(apps/game)이 새로 필요하다. 로컬 개발에서 두 서비스를 모두 띄우지 않으면 방 생성/게임 시작, 문의 알림이 동작하지 않는다.

## 고려했지만 선택하지 않은 대안

- **apps/game이 Quiz/User DB에 직접 연결**: 가장 빠르게 구현할 수 있었지만, 스키마 변경 시 두 서비스를 항상 동시에 맞춰야 하고 "Game이 API의 데이터 소유권을 침범하지 않는다"는 분리 목적 자체를 무너뜨린다.
- **매 라운드마다 apps/api를 재조회**: 구현은 더 단순하지만, 서비스 분리 직후 게임 진행 체감 지연(각 라운드 전환마다 네트워크 왕복)이 늘어나는 게 명백해 스냅샷 방식을 우선했다.
- **Kafka/이벤트 버스로 inquiry -> game 알림 전달**: 이번 분리 범위(MSA 분리)와 무관한 새 인프라 도입이라 제외했다. 알림 볼륨이 늘어나 HTTP 폴링/타임아웃 비용이 문제가 되면 그때 재검토한다.
