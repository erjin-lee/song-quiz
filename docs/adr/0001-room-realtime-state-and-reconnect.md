# ADR-0001: Room 실시간 상태 관리와 재접속 처리

- 상태: Accepted (재검토 예정 — 멀티 인스턴스 확장 시)
- 관련 코드: `apps/api/src/room/room.service.ts`, `apps/web/src/utils/roomSession.ts`, `apps/web/src/pages/RoomGamePage.tsx`

## 배경

방(room) 게임 진행 중 관리해야 하는 상태는 성격이 다른 세 종류가 섞여 있다.

1. 방 메타데이터·참가자 목록 — 방이 살아있는 동안 계속 유효해야 하는 상태
2. 라운드 진행용 상태 — 곡 출제 순서, 현재 라운드 정답, 라운드/스피드모드 타이머, 채팅 히스토리
3. 참가자 인증 — "이 소켓/요청이 실제로 이 방의 참가자인가"를 확인하는 접근 토큰

동시에 참가자 쪽에서는 새로고침이나 재접속을 해도 게임에서 튕겨나가지 않아야 한다.

## 결정

1. 방 메타데이터·참가자 목록은 `CacheService`(Redis, 연결 실패 시 로컬 메모리로 폴백)에 저장한다.
2. 라운드 진행용 상태(`songOrders`, `currentAnswers`, `currentReveal`, `roundTimers`, `speedModeTimers`, `chatHistory`)와 `roomId`별 동시 요청을 막는 락(`roomLocks`)은 `RoomService` 인스턴스의 in-memory `Map`으로 관리한다.
3. 참가자 접근 토큰은 무작위로 발급해 어딘가에 저장하는 대신, `roomId + userId`를 HMAC으로 서명해 매번 같은 값을 결정적으로 계산한다(`computeMembershipToken`). 토큰 자체를 폐기하는 절차는 없고, `room.participants`에 해당 `userId`가 남아있는지로 실제 접속 자격을 검증한다(퇴장 시 제거됨).
4. 프런트엔드는 방 입장 시 `{ roomId, userId, accessToken }`을 페이지 전환용 `location.state`로 넘기는 동시에 `localStorage`(`song-quiz:room-session`, `saveRoomSession`)에도 저장한다. `RoomGamePage`는 `location.state`가 없으면(새로고침, 공유 링크로 직접 진입 등) 저장된 값으로 재입장을 시도한다.

## 근거

- in-memory 락은 프로세스 내 동시 요청(같은 방에 대한 동시 입장/퇴장/정답 제출)으로 인한 경쟁 상태를 막기에는 충분하고, Redis 분산 락보다 구현이 단순하다.
- 결정적 서명 토큰은 무작위 발급 방식이 가진 세 가지 문제를 한 번에 해결한다: API 프로세스가 재시작돼도(배포 등) 같은 입력이면 항상 같은 토큰이 나오고, 여러 인스턴스에서 검증해도 결과가 같으며, 같은 계정이 다른 기기로 재입장해도 기존 기기의 토큰을 무효화하지 않는다.
- `location.state`만으로는 새로고침 시 재입장 정보가 사라지므로, `localStorage` 폴백을 별도로 둬서 해결했다.

## 결과 및 트레이드오프

- in-memory 상태(락, 곡 순서, 정답, 타이머, 채팅 히스토리)는 `apps/api`가 여러 인스턴스로 확장되면 인스턴스 간에 공유되지 않는다. 참가자의 요청/소켓 연결이 방을 처음 만든 인스턴스가 아닌 다른 인스턴스로 라우팅되면 라운드 상태가 보이지 않거나 락이 무력화될 수 있다.
- 결정적 멤버십 토큰은 개별적으로 폐기할 수 없다 — 접근 차단은 오직 `room.participants`에서 제거하는 방법뿐이다.

## 향후 재검토 조건

이 프로젝트는 향후 `apps/api`를 멀티 인스턴스로 확장할 계획이 있다. **확장을 실행하기 전에** 아래를 먼저 교체해야 한다.

- `roomLocks` → Redis 기반 분산 락(예: Redlock)
- `songOrders` / `currentAnswers` / `currentReveal` / `roundTimers` / `speedModeTimers` / `chatHistory` → Redis 또는 sticky session 기반 전략

이 작업 없이 멀티 인스턴스로 배포하면 라운드 동시성 보장이 깨진다.

## 고려했지만 선택하지 않은 대안

방/라운드 상태를 전부 Redis에 두는 방법도 가능했지만, 매 상태 변경마다 직렬화/역직렬화 비용과 네트워크 latency가 붙고 현재 트래픽 규모에서는 불필요한 복잡도라 채택하지 않았다. 멀티 인스턴스 확장 시점에 다시 검토한다.
