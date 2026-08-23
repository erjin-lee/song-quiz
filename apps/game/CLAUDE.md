# Game service conventions (apps/game)

# Purpose

실시간 방(room) 게임 서버를 소유한다. Room REST(`/rooms`)와 Socket.IO 네임스페이스 `/rooms`, 그리고 그 안에서 쓰는 분산 락·타이머·재접속 유예·Redis 기반 상태 관리가 이 서비스의 전부다. 일반 REST API(퀴즈/유저/문의/관리자)는 소유하지 않는다 — 그건 `apps/api`의 책임이다. 배경은 [`docs/adr/0004-game-service-split.md`](../../docs/adr/0004-game-service-split.md) 참고.

# Boundary (반드시 지킬 것)

- `apps/game`은 `apps/api/src/**`를 어떤 형태로도 import하지 않는다.
- Quiz/User TypeORM Repository나 Entity를 직접 참조하지 않는다. Quiz/User 데이터가 필요하면 `src/room/clients/quiz.client.ts`, `src/room/clients/auth.client.ts`(둘 다 `API_SERVICE_URL`로 apps/api의 `/internal/*` 엔드포인트를 호출)를 거친다.
- 게임 시작(`RoomService.startGame`/`restartGame`) 시 `QuizClient.getQuizRounds(quizId)`로 그 퀴즈의 전체 출제곡 라운드 데이터를 한 번에 받아(quizId 조건 하나로 조회 — 인덱스가 있어 곡 목록을 먼저 조회하는 별도 왕복이 필요 없다) 셔플/슬라이스한 뒤 Redis(`room:rounds:<roomId>`)에 캐시해두고, 라운드가 진행되는 동안(`advanceToNextRound`)에는 apps/api를 다시 호출하지 않는다. 새 라운드 관련 데이터가 필요해지면 이 스냅샷 캐시부터 확장하고, 라운드마다 apps/api를 호출하는 방식으로 되돌리지 않는다.
- apps/api가 이 서비스를 호출하는 경로(`InternalRoomController`, `/internal/rooms/inquiry-result`)는 반대 방향 의존을 만들지 않기 위한 것이다 — apps/api의 도메인 클래스를 이 서비스가 import하는 우회로로 쓰지 않는다.
- `/internal/*` 라우트는 전부 `InternalAuthGuard`(`src/common/internal-auth.guard.ts`)로 보호한다. 새 내부 엔드포인트를 추가하면 반드시 이 가드를 붙인다.

# Project layout

- `src/main.ts`: 부트스트랩, 포트 설정(`PORT`, 기본 `8002`), Socket.IO Redis 어댑터 연결.
- `src/app/`: 스캐폴드(`app.module.ts` 등).
- `src/room/`: 유일한 도메인 모듈. `room.controller.ts`(REST), `room.gateway.ts`(Socket.IO `/rooms`), `room.service.ts`, `room-lock.service.ts`(분산 락), `room-timer.service.ts`(지연 실행), `internal-room.controller.ts`(apps/api 전용), `clients/`(QuizClient, AuthClient), `dto/`.
- `src/cache/`, `src/logging/`, `src/common/`: apps/api와 같은 이름의 동일한 목적 모듈이지만 별도 프로세스라 파일을 그대로 복제해서 갖고 있다(ADR-0003과 동일하게, 아직 공유 패키지를 두지 않기로 한 결정에 따른 것 — 공유가 필요해지면 `packages/`에 워크스페이스로 뽑는 걸 우선 검토한다).
- 새 도메인을 이 서비스에 추가하지 않는다 — room 이외의 기능은 apps/api에 속한다.

# Redis/Socket.IO 동작

- room 메타데이터·참가자·라운드 진행 상태(`songOrder`/`roundsSnapshot`/`currentAnswers`/`currentReveal`/`chatHistory`)는 `CacheService`(Redis, `REDIS_HOST` 미설정 시 로컬 메모리 폴백)에 저장한다.
- roomId별 동시 요청 직렬화는 `RoomLockService`(REDIS_HOST 설정 시 분산 락, 아니면 프로세스 내 Promise 체이닝), 라운드/스피드모드/재접속 유예 타이머는 `RoomTimerService`가 담당한다. 동작 원리는 [`ADR-0001`](../../docs/adr/0001-room-realtime-state-and-reconnect.md) 참고 — apps/api에 있던 것과 완전히 동일한 코드를 그대로 옮겼다.
- 여러 인스턴스로 확장할 때는 Socket.IO Redis 어댑터(`src/common/redis-io.adapter.ts`)가 필요하다 — `main.ts`에서 `app.listen()` 전에 연결하고, 실패하면 부팅 자체를 실패시킨다(로컬 폴백으로 조용히 넘어가지 않음).

# Commands

- Game 빌드(루트에서 turbo 필터 실행)
```bash
yarn game:build
```

- Game 실행(watch)
```bash
yarn game
```

- Game 실행(watch, `.env.local` 로드)
```bash
yarn game:local
```

- 워크스페이스 내부에서 직접 실행
```bash
yarn workspace game start:dev
yarn workspace game start:dev:local
yarn workspace game build
yarn workspace game test
yarn workspace game lint
```

# Verification

1. 변경된 파일의 타입 오류를 확인한다.
2. 관련 테스트를 실행한다 (`yarn workspace game test`).
3. 영향 범위가 넓으면 Game 빌드를 실행한다 (`yarn game:build`).
4. Room REST/Socket.IO 동작을 바꿨다면 `apps/api`의 `/internal/*` 계약(요청/응답 형식)이 함께 바뀌었는지 확인하고, 바뀌었다면 `apps/api`의 해당 internal controller/service와 그 테스트도 맞춘다.
5. `yarn game:local` 등으로 서버를 직접 띄워 실제 호출까지 테스트했다면, 테스트가 끝난 뒤 해당 프로세스를 종료한다(포트 점유로 인한 EADDRINUSE, 좀비 프로세스 누적을 방지).
