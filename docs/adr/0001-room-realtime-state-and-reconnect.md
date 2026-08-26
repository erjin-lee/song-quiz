# ADR-0001: Room 실시간 상태 관리와 재접속 처리

- 상태: Accepted (멀티 인스턴스 대응 완료 — 아래 "멀티 인스턴스 마이그레이션" 참고)
- 관련 코드: `apps/game/src/room/room.service.ts`, `apps/game/src/room/room-lock.service.ts`, `apps/game/src/room/room.repository.ts`, `apps/game/src/room/room-timer.service.ts`, `apps/game/src/room/room.gateway.ts`, `apps/game/src/cache/cache.service.ts`, `apps/game/src/common/redis-io.adapter.ts`, `apps/web/src/utils/roomSession.ts`, `apps/web/src/pages/RoomGamePage.tsx`
- 2026-08-23: `apps/api/src/room/**`에 있던 코드가 `apps/game`으로 이동했다(내용은 그대로, 위치만 이동). 서비스 분리 배경은 [`ADR-0004`](0004-game-service-split.md) 참고.

## 배경

방(room) 게임 진행 중 관리해야 하는 상태는 성격이 다른 세 종류가 섞여 있다.

1. 방 메타데이터·참가자 목록 — 방이 살아있는 동안 계속 유효해야 하는 상태
2. 라운드 진행용 상태 — 곡 출제 순서, 현재 라운드 정답, 라운드/스피드모드 타이머, 채팅 히스토리
3. 참가자 인증 — "이 소켓/요청이 실제로 이 방의 참가자인가"를 확인하는 접근 토큰

동시에 참가자 쪽에서는 새로고침이나 재접속을 해도 게임에서 튕겨나가지 않아야 한다.

## 결정

1. 방 메타데이터·참가자 목록은 `CacheService`(Redis, 연결 실패 시 로컬 메모리로 폴백)에 저장한다.
2. 라운드 진행용 상태(`songOrder`, `currentAnswers`, `currentReveal`, `chatHistory`)는 `CacheService`를 통해 Redis에 저장하고, `roomId`별 동시 요청을 막는 락은 `RoomLockService`, 라운드/스피드모드/재접속 유예 타이머는 `RoomTimerService`가 관리한다(각각 아래 "멀티 인스턴스 마이그레이션" 참고).
3. 참가자 접근 토큰은 무작위로 발급해 어딘가에 저장하는 대신, `roomId + userId`를 HMAC으로 서명해 매번 같은 값을 결정적으로 계산한다(`computeMembershipToken`). 토큰 자체를 폐기하는 절차는 없고, `room.participants`에 해당 `userId`가 남아있는지로 실제 접속 자격을 검증한다(퇴장 시 제거됨).
4. 프런트엔드는 방 입장 시 `{ roomId, userId, accessToken }`을 페이지 전환용 `location.state`로 넘기는 동시에 `localStorage`(`song-quiz:room-session`, `saveRoomSession`)에도 저장한다. `RoomGamePage`는 `location.state`가 없으면(새로고침, 공유 링크로 직접 진입 등) 저장된 값으로 재입장을 시도한다.

## 근거

- 결정적 서명 토큰은 무작위 발급 방식이 가진 세 가지 문제를 한 번에 해결한다: API 프로세스가 재시작돼도(배포 등) 같은 입력이면 항상 같은 토큰이 나오고, 여러 인스턴스에서 검증해도 결과가 같으며, 같은 계정이 다른 기기로 재입장해도 기존 기기의 토큰을 무효화하지 않는다.
- `location.state`만으로는 새로고침 시 재입장 정보가 사라지므로, `localStorage` 폴백을 별도로 둬서 해결했다.

## 결과 및 트레이드오프

- 결정적 멤버십 토큰은 개별적으로 폐기할 수 없다 — 접근 차단은 오직 `room.participants`에서 제거하는 방법뿐이다.
- 아래 "멀티 인스턴스 마이그레이션"에 정리된 트레이드오프(락 TTL, 타이머 재수거 지연, `fetchSockets()` 응답 누락 가능성 등)가 추가로 존재한다.

## 멀티 인스턴스 마이그레이션 (2026-08-21)

`apps/api`를 여러 인스턴스로 수평 확장하기 위해, 이 ADR이 최초에 "확장 전 필수"로 명시했던 항목들을 실제로 교체했다.

### 변경 내용

- **`roomLocks`(in-memory Promise 체이닝) → `RoomLockService`**: REDIS_HOST가 설정돼 있으면 `SET NX PX` + 토큰 기반 Lua CAS 해제 + 하트비트 연장으로 동작하는 분산 락을 쓰고, 설정돼 있지 않으면(로컬 개발 등) 기존과 동일한 in-memory Promise 체이닝으로 폴백한다. 락 획득에 실패하면 로컬 락으로 조용히 강등하지 않고 예외를 던진다(fail-closed) — 강등하면 이 마이그레이션이 막으려던 레이스가 그대로 재발하기 때문이다.
- **`songOrders`/`currentAnswers`/`currentReveal`/`chatHistory`(in-memory Map) → `CacheService` 경유 Redis**: 앞의 셋은 라운드 준비 시 전량 교체되는 값이라 기존 `get/set/del`을 그대로 재사용했고, `chatHistory`는 append형이라 레이스가 있어 Redis LIST의 `RPUSH`+`LTRIM`+`EXPIRE`를 `MULTI/EXEC`로 묶어 락 없이 원자적으로 처리한다.
- **`roundTimers`/`speedModeTimers`(in-memory setTimeout) → `RoomTimerService`**: REDIS_HOST가 설정돼 있으면 단일 글로벌 ZSET(`room:timers`)에 예약하고, 각 인스턴스가 폴링하며 Lua CAS로 "예약(claim)"해 정확히 한 인스턴스만 처리하게 한다. 즉시 삭제 대신 예약 방식을 쓴 이유는 크래시 내성 때문이다 — claim한 인스턴스가 처리 도중 죽어도, 일정 시간(`RESERVATION_MS`, 락 대기시간의 2배) 후 다른 인스턴스가 자동으로 재수거한다. REDIS_HOST가 없으면 기존과 동일한 setTimeout+Map으로 폴백한다.
- **`RoomGateway`의 숨은 크로스 인스턴스 버그 2건도 함께 수정**: (1) 재접속 유예 타이머(`pendingLeaveTimers`)가 로컬 Map이라 재접속이 disconnect 발생 인스턴스와 다른 인스턴스로 로드밸런싱되면 재접속을 감지하지 못해 정상 접속한 유저를 강제 퇴장시키는 문제 — `RoomTimerService`의 `disconnect-grace` kind로 흡수해 인스턴스 간 취소가 가능하게 했다. (2) 다중 탭/기기 감지(`hasOtherActiveSocket`)가 로컬 소켓만 보던 문제 — Socket.IO의 `fetchSockets()`(Redis 어댑터가 인스턴스 간 소켓까지 집계)로 교체했다.
- **Socket.IO에 Redis 어댑터(`@socket.io/redis-adapter`) 연동**: `server.to(room).emit(...)` 같은 room 기반 브로드캐스트가 인스턴스 간에도 전달되도록 `apps/api/src/common/redis-io.adapter.ts`(`RedisIoAdapter`)를 붙였다. `InquiryService.emitInquiryResult`처럼 다른 인스턴스에서 발생한 이벤트를 특정 유저 소켓으로 전달해야 하는 경로가 이걸로 해결된다.

### 새 트레이드오프

- 분산 락은 TTL(8초) 안에 임계구역이 끝나지 못하면 하트비트로 연장하지만, 그마저도 실패하면 다른 인스턴스가 락을 가로챌 수 있다 — 임계구역이 DB 쿼리 몇 개 수준인 현재 코드에서는 사실상 도달하지 않는 경로다.
  - **(2026-08-26 정정)** 이 판단은 틀렸다. 하트비트가 실패하는 조건을 "임계구역이 느린 경우"로만 봤는데, 실제로는 **임계구역 길이와 무관하게 Redis에 닿지 못하기만 해도** 하트비트가 실패한다. 아래 "Redis 장애 내성 보강" 참고.
- 타이머 재수거는 최소 1회(at-least-once) 보장이라 크래시 시 최대 `RESERVATION_MS`(24초)만큼 늦게 처리될 수 있다. 핸들러가 이미 상태 가드를 갖고 있어 중복 실행 자체는 안전하다.
- `fetchSockets()`는 응답이 느린 인스턴스의 소켓을 조용히 누락할 수 있다 — disconnect 시점과 유예 만료 직전 두 번 확인해 완화하지만 완전히 제거되지는 않는 잔여 리스크다.
- REDIS_HOST가 설정되지 않은 환경(로컬 개발, 단위 테스트)은 기존과 100% 동일하게 단일 인스턴스로 동작한다 — 이 마이그레이션은 로컬 개발 경험을 바꾸지 않는다.

## 재접속 후속 수정 (2026-08-21)

멀티 인스턴스 마이그레이션 이후에도 남아있던 재접속 관련 결함 두 건을 수정했다.

### 문제

1. **소켓 재연결 시 room:enter 미재전송**: `apps/web`의 `createRoomSocket()`은 `socket.io-client` 기본 재연결 옵션(무제한 재시도)을 그대로 쓰지만, `RoomGamePage`가 `room:enter`를 마운트 시 한 번만 emit했다. 서버 재시작 등으로 소켓이 끊겼다가 transport 레벨로만 재연결되면 애플리케이션 레벨 재입장이 되지 않아, `disconnect-grace`(10초) 만료로 참가자가 방에서 제거되고 room 멤버십(Socket.IO room, `socketMemberships`)도 복구되지 않았다.
2. **입장 메시지 판별을 disconnect-grace 타이머 취소 성공 여부로 결정**: `room:enter`는 `cancelPendingLeave()`(disconnect-grace 타이머 취소)가 성공했는지로 "재접속 vs 신규 입장"을 판별해 `"입장했습니다"` 메시지를 기록했다. 그런데 서버 프로세스가 disconnect 유예 타이머를 예약하기 전에 죽으면(비정상 종료) 애초에 취소할 타이머가 없어 이 판별이 항상 "신규 입장"으로 오판된다. 배포/장애로 다수 클라이언트가 동시에 재연결하면 입장 메시지가 채팅 히스토리에 중복 기록됐다.

### 결정

1. `RoomGamePage`가 `socket.on('connect', ...)` 안에서 `room:enter`를 재emit하도록 변경했다(최초 접속·재연결 공통 경로). 연결 끊김/복구 시 채팅창에 시스템 메시지도 안내한다.
2. `room:enter`(`RoomGateway.handleEnter`)는 서버가 이미 조회해둔 최신 `RoomItemDto`를 `room:state`로 해당 소켓에 직접 보낸다 — 재연결한 클라이언트가 끊긴 동안 놓친 `room:state` 브로드캐스트를 기다리지 않고 최신 화면을 받게 하기 위함이다.
3. `"입장했습니다"` 메시지는 `room:enter`가 아니라 `RoomService.joinRoom`이 실제로 새 참가자를 만들 때만 발생시키는 `participant-joined` 이벤트로 옮겼다(`nickname-changed`와 동일한 패턴으로 `RoomGateway`가 구독). `room:enter`는 이제 `cancelPendingLeave()`를 여전히 호출해 예약된 퇴장만 취소할 뿐, 그 결과로 메시지 여부를 판단하지 않는다.

### 근거

- 소켓 재연결과 REST 입장은 서로 다른 신호다. "이 유저가 실제로 새로 들어왔는가"는 REST `joinRoom`이 참가자 레코드를 새로 만들었는가로 결정하는 것이 가장 정확하고, 소켓 disconnect/reconnect 타이밍(타이머 예약 성공 여부 포함)에 영향받지 않는다.
- REST 입장 시점에는 아직 새 참가자의 소켓이 연결되지 않았으므로, 기존처럼 "본인 제외 브로드캐스트"(`excludeClient`)를 할 수 없다 — 새 참가자는 곧이어 `room:enter`가 내려주는 `chat:history`로 자신의 입장 메시지를 뒤늦게 확인한다. 실시간 노출 타이밍이 수백 ms 늦어질 뿐 기존 UX와 체감 차이는 없다.

## Redis 장애 내성 보강 (2026-08-26)

### 문제

멀티 인스턴스 마이그레이션은 **"락을 쥔 프로세스가 죽는 경우"** 를 방어했다. TTL이 락을 자동으로 풀고, 토큰 기반 CAS 해제가 "내 락이 이미 만료된 뒤 남의 락을 실수로 푸는" 것을 막는다. 여기까지는 의도대로 동작한다.

방어되지 않은 것은 **"프로세스는 살아있는데 락을 잃는 경우"** 다. Redis가 락 TTL(8초)보다 길게 끊기면 Redis 서버 쪽에서 락 key가 그냥 사라지는데, 당시 코드에서 하트비트 실패 처리는 `.catch(warn 로그)` 한 줄이 전부였다. 즉 **임계구역은 자기가 락을 잃었다는 사실을 알 방법이 없었다.**

```text
t=0    A: SET NX 성공
t=1    Redis 단절
t=4    A: PEXPIRE 실패 → warn 로그만 남음
t=8    Redis: TTL 만료로 락 key 삭제        ← A는 모른다
t=8+   B: SET NX 성공                       ← 둘 다 자기가 락을 쥐었다고 믿는다
t=12   A: saveRoom() → B가 쓴 상태를 덮어씀
```

위 "새 트레이드오프"에서 이 경로를 "임계구역이 DB 쿼리 몇 개 수준이라 사실상 도달하지 않는다"고 적었던 것이 이 결함의 원인이다. **하트비트 실패는 임계구역의 길이와 무관하다** — Redis에 닿지 못하기만 하면 실패한다. 임계구역이 아무리 짧아도, 그 짧은 구간 중에 Redis가 8초 끊기면 그대로 발생한다.

같은 뿌리에서 나온 문제가 두 개 더 있었다.

- 락으로 보호하는 `room:index` read-modify-write가 lenient `get`/`set`을 써서, Redis 장애 중 **로컬 메모리에서 읽고 로컬 메모리에 쓴 뒤 성공을 반환**했다. 락으로 직렬화한 의미가 사라진다.
- 락 획득 루프가 `isRedisReady()`가 false면 즉시 포기해, 수백 ms짜리 재연결에도 503이 나갔다.

### 결정

임계구역이 "락을 잃었다"를 **알 수 있게** 만들고, 알기 전에 쓰더라도 **저장소가 거부하게** 만든다. 세 층을 쌓되, 각 층은 앞 층이 원리적으로 막을 수 없는 것을 막는다.

| 층 | 막는 것 | 이 층이 못 막는 것 |
|---|---|---|
| lease | 만료를 감지하고 abort | 이미 시작된 `await` |
| write boundary | 쓰기/삭제 직전 차단 | 검사~실행 사이의 틈(GC pause 등) |
| fencing token | Redis가 원자적으로 거부 | — (판단 주체가 Redis) |

1. **lease** — 락을 boolean이 아니라 만료 시각을 가진 `LockLease`로 다룬다. 유효성은 `lastSuccessfulRenewalAt + TTL`로만 판단하고, 만료되면 `AbortController.abort()`와 함께 `room_lock_lease_lost`를 error로 남긴다.
2. **write boundary** — 상태 쓰기/삭제 직전에 lease를 다시 확인한다. 모든 상태 변경이 `RoomRepository`의 단일 통로를 지나므로 방어도 한 곳에만 건다.
3. **fencing token** — 락 획득 시 monotonic token을 발급하고, 쓰기/삭제를 Lua로 원자 검사해 더 새로운 token이 이미 발급됐으면 거부한다. **삭제도 상태를 바꾸는 쓰기로 취급한다** — 뒤늦게 정리에 들어간 워커가 다른 워커가 방금 기록한 상태를 지우는 경로가 있었다.

그 외: `room:index`의 read-modify-write를 strict path로 바꿔 fail-closed 하고(목록 조회용 읽기는 게임 정합성과 무관해 lenient 유지), 락 획득 재시도 예산을 경합용과 Redis 장애용으로 분리했다.

### 근거

- **유효성 판단을 "연속 N회 실패"가 아니라 시각 기준으로 한 이유**: 하트비트 실패 횟수는 Redis가 key를 언제 지우는지와 아무 관계가 없다. 실제 만료 시각을 결정하는 것은 마지막으로 `PEXPIRE`가 실행된 시점뿐이다. 같은 이유로 갱신 성공 시각은 응답받은 시각이 아니라 **커맨드를 보낸 시각**으로 잡는다 — 서버의 실제 처리 시점은 항상 그 이후이므로, 우리 계산이 서버보다 낙관적일 수 없다.
- **갱신 주기를 마지막 "시도"가 아니라 마지막 "성공" 기준으로 잡은 이유**: 시도 기준이면 t=4s 연장이 실패했을 때 다음 시도가 t=8s(이미 만료된 뒤)라, 1~2초짜리 blip조차 넘기지 못한다.
- **AbortSignal만으로 끝내지 않은 이유**: `abort()`는 신호일 뿐 이미 시작된 `await`를 되돌리지 못한다. 실제 쓰기 직전의 재확인이 없으면 신호는 무시된 채 쓰기가 진행된다.
- **write boundary만으로 끝내지 않고 fencing까지 간 이유**: 로컬 시계로 하는 검사는 검사~실행 사이의 틈(TOCTOU)을 원리적으로 없앨 수 없다. 판단 주체를 Redis로 옮기면 그 틈이 사라진다.
- **lease를 인자가 아니라 `AsyncLocalStorage`로 전달한 이유**: 인자로 넘기려면 `withRoomLock` 호출부 14곳 + `RoomRepository` 전체 + 중간 경유지 `RoomRoundService`까지 시그니처가 줄줄이 바뀐다. `packages/logger`의 `LogContext`가 이미 같은 방식이라 새 기법을 들여오는 것이 아니다. 암묵 전달의 위험(엉뚱한 락 아래에서 쓰기)은 "이 키를 보호하는 락"을 명시적 인자로 받아 대조하는 것으로 상쇄했다 — 중첩 락(room 락 안의 room-index 락)에서 ambient lease가 안쪽 것이 되기 때문에, 이 대조가 없으면 fencing이 엉뚱한 카운터를 검사하면서 **통과한다**. 방어가 있다는 착각만 남는 것이 아무 방어도 없는 것보다 나쁘다.
- **락 획득 재시도 예산을 둘로 나눈 이유**: 락을 쥔 워커를 기다리는 것은 언젠가 끝나는 생산적인 대기지만, Redis가 죽은 동안의 대기는 아무것도 진행시키지 못한 채 요청만 쌓는다. 장애 예산 1초는 ioredis `retryStrategy`(200/400/600ms)의 재연결 시도 2~3회를 덮으면서, 실시간 게임에서 사용자가 소켓 액션 정지를 체감하지 않는 상한이다. 경합 예산 12초는 `RoomTimerService.RESERVATION_MS`가 파생되므로 그대로 뒀다 — 줄이면 타이머 재수거 의미론까지 함께 바뀐다.
- **fail-closed를 택한 이유**: lease를 잃은 채 임계구역이 완주하면 값을 반환했더라도 예외를 던진다. "B와 나란히 덮어썼는데 성공으로 보고"하는 것보다 드러나는 실패가 낫다. 타이머 핸들러 경로에서는 `RoomTimerService`가 예약을 유지해 자동 재시도하므로 오히려 이쪽이 맞는 동작이다.

### 새 트레이드오프

- **가용성을 정합성과 맞바꿨다.** Redis 장애 중 room 상태를 바꾸는 요청은 이제 로컬로 폴백해 "성공한 것처럼" 보이는 대신 503을 반환한다. 방 목록 조회처럼 정합성과 무관한 읽기만 기존대로 폴백한다.
- **`deleteRoom`이 Redis 장애 중 실패한다.** 기존에는 `del`이 오류를 삼켜 절반만 지워진 채 `roomDeleted: true`를 반환했다. 이제 `leaveRoom`이 503을 반환한다.
- **lease 상실 이전에 쓰기를 끝낸 작업도 거부된다.** 클라이언트는 503을 받고 재시도하는데 실제로는 첫 시도가 반영돼 있을 수 있다. 임계구역 중 어느 지점에서 lease를 잃었는지를 정확히 추적하지 않고 "한 번이라도 잃었으면 실패"로 단순화한 결과다.
- **`deleteRoom`은 여전히 원자적이지 않다.** 방 레코드 삭제 후 인덱스 제거가 실패하면 인덱스에 유령 항목이 남는다(`getRooms`가 걸러내고 6시간 TTL로 정리된다). 이 부분은 이번 변경에서 다루지 않았다.
- **`createRoom`의 최초 `saveRoom`은 락 밖이라 fencing이 없다.** 아직 아무도 모르는 새 roomId라 실제 경합은 없지만 구조적으로는 열려 있다.
- **`apps/game`과 `apps/api`의 `cache` 모듈이 갈라졌다.** fencing이 필요한 쪽은 room 락이 있는 `apps/game`뿐이라 그쪽에만 추가했다. 지금까지 "파일을 그대로 복제"였던 관계가 깨졌으므로, 이후 캐시 계층을 고칠 때 두 파일이 동일하다고 가정하면 안 된다.

## 고려했지만 선택하지 않은 대안

- 방/라운드 상태를 전부 Redis에 두는 방법(최초 검토 시점): 매 상태 변경마다 직렬화/역직렬화 비용과 네트워크 latency가 붙는다는 우려가 있었으나, 실제 멀티 인스턴스 마이그레이션 시점에 측정해보니 현재 트래픽 규모에서는 무시할 수준이라 채택했다.
- 락 TTL을 늘려(예: 60초) Redis 장애를 견디는 방법: 장애를 견디는 시간은 늘어나지만, 그만큼 **실제로 죽은 인스턴스의 락이 풀리는 시간도 늘어난다.** 배포 중 SIGKILL 한 번에 그 방이 60초간 잠기는 쪽이 더 나쁘다. TTL은 "죽은 프로세스 회수 속도"와 "네트워크 장애 내성"의 트레이드오프이고, 후자는 TTL이 아니라 lease/fencing으로 푸는 것이 맞다.
- Redlock(여러 Redis 노드 과반 획득) 도입: 현재 Redis는 단일 ElastiCache 인스턴스라 애초에 과반을 구성할 노드가 없고, 노드를 늘려도 이번에 발생한 문제(클라이언트가 자기 lease 만료를 모르는 것)는 해결되지 않는다. Redlock 역시 fencing token을 별도로 요구한다.
- `roundTimers`/`speedModeTimers`를 Redis 키 만료 이벤트(`notify-keyspace-events` + `expired` 키스페이스 알림)로 구현하는 방법: 관리형 Redis(AWS ElastiCache 등)에서 이 설정이 기본 비활성화돼 있고, 인프라 파라미터 그룹을 바꿔야 하며, pub/sub 특성상 전달 실패 시 알림이 그냥 유실될 수 있어 채택하지 않았다. 대신 각 인스턴스가 직접 폴링하는 ZSET 방식을 택해 별도 Redis 설정 변경 없이 동작하게 했다.
