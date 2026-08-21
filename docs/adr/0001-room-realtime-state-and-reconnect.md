# ADR-0001: Room 실시간 상태 관리와 재접속 처리

- 상태: Accepted (멀티 인스턴스 대응 완료 — 아래 "멀티 인스턴스 마이그레이션" 참고)
- 관련 코드: `apps/api/src/room/room.service.ts`, `apps/api/src/room/room-lock.service.ts`, `apps/api/src/room/room-timer.service.ts`, `apps/api/src/room/room.gateway.ts`, `apps/api/src/common/redis-io.adapter.ts`, `apps/web/src/utils/roomSession.ts`, `apps/web/src/pages/RoomGamePage.tsx`

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
- 타이머 재수거는 최소 1회(at-least-once) 보장이라 크래시 시 최대 `RESERVATION_MS`(24초)만큼 늦게 처리될 수 있다. 핸들러가 이미 상태 가드를 갖고 있어 중복 실행 자체는 안전하다.
- `fetchSockets()`는 응답이 느린 인스턴스의 소켓을 조용히 누락할 수 있다 — disconnect 시점과 유예 만료 직전 두 번 확인해 완화하지만 완전히 제거되지는 않는 잔여 리스크다.
- REDIS_HOST가 설정되지 않은 환경(로컬 개발, 단위 테스트)은 기존과 100% 동일하게 단일 인스턴스로 동작한다 — 이 마이그레이션은 로컬 개발 경험을 바꾸지 않는다.

## 고려했지만 선택하지 않은 대안

- 방/라운드 상태를 전부 Redis에 두는 방법(최초 검토 시점): 매 상태 변경마다 직렬화/역직렬화 비용과 네트워크 latency가 붙는다는 우려가 있었으나, 실제 멀티 인스턴스 마이그레이션 시점에 측정해보니 현재 트래픽 규모에서는 무시할 수준이라 채택했다.
- `roundTimers`/`speedModeTimers`를 Redis 키 만료 이벤트(`notify-keyspace-events` + `expired` 키스페이스 알림)로 구현하는 방법: 관리형 Redis(AWS ElastiCache 등)에서 이 설정이 기본 비활성화돼 있고, 인프라 파라미터 그룹을 바꿔야 하며, pub/sub 특성상 전달 실패 시 알림이 그냥 유실될 수 있어 채택하지 않았다. 대신 각 인스턴스가 직접 폴링하는 ZSET 방식을 택해 별도 Redis 설정 변경 없이 동작하게 했다.
