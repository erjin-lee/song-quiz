# Socket.IO 부하 테스트 (Artillery)

`apps/game`의 실시간 게임 흐름을 Virtual User가 **실제로 플레이하도록** 재현하는 부하 테스트다.
단순 emit 반복이 아니라 서버가 보내는 `room:state`를 기다리며 다음 행동을 결정한다.

**부하의 단위는 누적 VU 수가 아니라 "동시에 붙어 있는 Socket 연결 수"다.** 아래 "동시 접속
기준" 항목을 먼저 읽는 것을 권한다.

---

## 동시 접속 기준 (중요)

Artillery의 `arrivalRate` / `arrivalCount`는 **"새로 도착한 VU 수"(누적)** 이지 **"지금 붙어
있는 소켓 수"** 가 아니다. 둘의 관계는 Little's Law를 따른다.

```text
동시 접속 ≈ 도착률 × 세션 길이
```

세션이 짧으면 아무리 많이 투입해도 동시 접속은 오르지 않는다.

| | 도착 | 세션 길이 | 실제 동시 접속 |
|---|---|---|---|
| 순진한 설정 | 60초에 100명 (1.67/s) | 26초 | **≈ 43명** ❌ |
| 이 테스트 | 20초에 100명 (5/s) | 유지 시각까지 (180초+) | **100명** ✅ |

그래서 이 processor는 VU를 **"정해진 시각(`holdUntil`)까지 소켓을 붙잡고 계속 플레이하는"**
모델로 만든다. 게임이 끝나면(`FINISHED`) 방장이 `game:restart`로 다음 판을 시작해 세션을
이어간다. 램프업이 끝난 뒤부터는 투입한 VU 수가 그대로 동시 접속 수가 된다.

`holdUntil`은 `before` 훅에서 한 번 계산해 모든 VU가 공유한다. 전원이 같은 시각에 빠져나가므로
동시 접속 그래프가 계단이 아니라 **사각형**이 되고, "N명을 유지했다"고 말할 수 있게 된다.

### 실제 도달했는지 반드시 확인한다

설정값을 믿지 말고 **`game.socket.concurrent` 지표의 `max` / `median`** 을 본다. 1초마다
실제 열려 있는 소켓 수를 세어 기록한 값이다.

```text
game.socket.concurrent:
  max: ......... 100     ← 실제로 100명에 도달
  median: ...... 98.7    ← 유지 구간 대부분에서 유지됨
```

목표의 90%에 못 미치면 `ensure` 검사가 실패한다(`load:step` 기준). **부하가 덜 걸린 채
"문제 없음"으로 오독하는 것이 이 테스트에서 가장 위험한 실수**라 자동으로 막았다.

---

## 무엇을 재현하는가

```text
POST /rooms/:id/join (REST)      ← 기존 공개 API 그대로 사용
  → Socket.IO 연결 (/rooms)
  → room:enter → room:state 수신
  → time:sync (ACK 왕복 측정)
  → [방장] game:start
  → holdUntil까지 반복 {
       LOADING     → 영상 로딩 think → game:ready
       PLAYING     → think → chat:message(정답 시도) → think → game:skip
       ROUND_ENDED → [방장] game:next-round
       FINISHED    → [방장] game:restart      ← 세션을 이어가는 지점
     }
  → room:leave → disconnect
```

### 확인한 실제 이벤트

전부 코드에서 확인한 것이며 추측한 것이 없다.

| 항목 | 값 | 출처 |
|---|---|---|
| namespace | `/rooms` | `room.gateway.ts` `@WebSocketGateway` |
| 입장 | `room:enter { roomId, userId, accessToken }` | `handleEnter` |
| **유일한 ACK** | `time:sync { clientSentAt }` → `{ serverTime }` | `handleTimeSync` |
| 정답 제출 | **`chat:message { message }`** (별도 answer 이벤트 없음) | `handleMessage` → `submitChatMessage` |
| 게임 조작 | `game:start` / `game:ready` / `game:skip` / `game:next-round` / `game:restart` / `game:force-skip` (payload 없음) | `room.gateway.ts` |
| 퇴장 | `room:leave` (payload 없음) | `handleLeave` |
| 서버→클라 | `room:state` / `chat:message` / `chat:system` / `chat:history` / `room:error` | 동 파일 |

> **왜 Artillery의 `socketio` 엔진을 쓰지 않았나**
> `apps/game`은 ACK 기반이 아니라 broadcast 기반이다. 반환값(ACK)을 주는 핸들러는 `time:sync`
> 하나뿐이고 나머지는 전부 `room:state` 브로드캐스트로 응답한다. socketio 엔진의 emit/response
> 매칭으로는 "다음 라운드가 시작될 때까지 기다린다"를 표현할 수 없어 고정 sleep으로 상태를
> 추측하게 되는데, 그러면 **서버가 느려져도 부하가 같이 느려지지 않아 측정이 왜곡된다.**
> 그래서 processor에서 `socket.io-client`를 직접 다뤄 상태 전이를 실제로 기다린다.

---

## 설정 (`.env`)

부하 크기·시간·대상은 전부 `load-tests/artillery/.env`에 있다. 파일이 없으면 `yarn load:*`가
`.env.example`을 복사해 만들어준다(기존 파일은 덮어쓰지 않는다).

```bash
vi load-tests/artillery/.env    # LOAD_TARGET / LOAD_QUIZ_ID 를 환경에 맞게
```

**우선순위: 명령줄 환경변수 > `.env` > 코드 기본값(`processors/game.ts`)**

Artillery의 `--dotenv`는 이미 설정된 환경변수를 덮어쓰지 않기 때문이다. 그래서 단계별
테스트는 `.env`를 고치지 않고 명령줄로만 바꿔가며 돌리면 된다.

```bash
LOAD_CONCURRENT_USERS=100 yarn load:step   # .env의 값보다 우선한다
```

`.env` / `.env.local`은 `.gitignore` 대상이고 `.env.example`만 커밋된다.
**이 파일에는 비밀값을 넣지 않는다** — 들어 있는 것은 전부 부하 크기/시간 튜너블이며, 방
생성·입장은 게스트 경로(쿠키 없음)라 credential 자체가 필요 없다.

## 실행

```bash
yarn load:smoke   # 동시 10명 / 30초 고정. 테스트 코드와 게임 흐름 점검용(부하 아님)
yarn load:step    # 동시 N명을 유지하는 한 단계 (기본 50명 / 180초)
yarn load:game    # load:step과 동일 (기존 이름 유지)
yarn load:spike   # baseline 50명이 붙어 있는 상태에서 20초 동안 +250명
```

세 명령 모두 **명시적으로 실행할 때만** 동작한다. `load-tests/`는 yarn workspace가 아니라
(`package.json`의 `workspaces`는 `apps/*`, `apps/lambda/*`, `packages/*`), `yarn test`나
`turbo run test`가 이 디렉터리를 건드리지 않는다.

### 단계별 테스트: 25 → 50 → 100 → 200 → 300

**한 번에 300까지 올리지 않는다.** 어느 지점에서 꺾였는지 알 수 없고, 단계 사이에 중단 기준을
판정할 틈도 없다. 한 단계씩 따로 실행하고, 매번 아래 "중단 기준"을 확인한 뒤 다음으로 넘어간다.

```bash
LOAD_TARGET=https://game.example.com LOAD_QUIZ_ID=7 \
LOAD_CONCURRENT_USERS=25  LOAD_USERS_PER_ROOM=5  yarn load:step
# → 중단 기준 확인 → 문제 없으면 다음 단계

LOAD_CONCURRENT_USERS=50  LOAD_USERS_PER_ROOM=10 yarn load:step
LOAD_CONCURRENT_USERS=100 LOAD_USERS_PER_ROOM=10 yarn load:step
LOAD_CONCURRENT_USERS=200 LOAD_USERS_PER_ROOM=10 yarn load:step
LOAD_CONCURRENT_USERS=300 LOAD_USERS_PER_ROOM=10 yarn load:step
```

| 단계 | 동시 접속 | 방 수 (자동 계산) | 램프업 | 유지 |
|---|---|---|---|---|
| 1 | 25 | 5 rooms × 5명 | 20s | 180s |
| 2 | 50 | 5 rooms × 10명 | 20s | 180s |
| 3 | 100 | 10 rooms × 10명 | 20s | 180s |
| 4 | 200 | 20 rooms × 10명 | 20s | 180s |
| 5 | 300 | 30 rooms × 10명 | 20s | 180s |

방 개수는 `LOAD_CONCURRENT_USERS / LOAD_USERS_PER_ROOM`으로 **processor가 자동 계산**한다.
세 값을 각자 적다가 어긋나면 방이 덜 차서 게임이 시작되지 않으므로, 사람이 세지 않게 했다.
나누어떨어지는 값을 쓴다.

**단계 사이에 최소 2~3분은 쉰다.** 앞 단계의 방/소켓이 정리되고 CloudWatch 지표가 baseline으로
돌아오는 데 시간이 걸린다. 바로 이어 붙이면 앞 단계의 잔열을 다음 단계 결과로 오해하게 된다.

각 단계마다 **동시 접속 실측치(`game.socket.concurrent.max`)와 주요 지표를 기록**해두고 단계
간 추이를 비교한다. 절대값 하나만으로는 병목을 알 수 없고, **어느 단계에서 기울기가 꺾이는지**가
답을 준다.

### 환경변수

기본값은 전부 "로컬에서 안전한 작은 값"이다. 실제 부하는 값을 명시해서 올린다.

아래 기본값은 `.env.example`에 그대로 들어 있다.

| 변수 | 기본 | 설명 |
|---|---|---|
| `LOAD_TARGET` | `http://localhost:8002` | apps/game 주소 |
| `LOAD_QUIZ_ID` | `1` | 방을 만들 퀴즈 ID. **출제곡이 있는 실제 퀴즈여야 한다** |
| `LOAD_CONCURRENT_USERS` | step 50 / smoke 10 | **목표 동시 접속 수** |
| `LOAD_USERS_PER_ROOM` | step 10 / smoke 5 | 방당 인원 (서버 상한 50) |
| `LOAD_ROOMS` | 자동 계산 | `CONCURRENT / USERS_PER_ROOM`. 불균등 분포를 일부러 만들 때만 직접 지정 |
| `LOAD_ARRIVAL_SECONDS` | 20 | 전원 투입에 걸리는 시간(램프업) |
| `LOAD_HOLD_SECONDS` | 180 | **램프업 후 목표 동시 접속을 유지하는 시간** |
| `LOAD_SONG_LIMIT` | 3 | 한 게임의 라운드 수. 세션 길이와는 무관(끝나면 재시작) |
| `LOAD_STATE_TIMEOUT_MS` | 30000 | 상태 전이 하나를 기다리는 상한 |
| `SPIKE_BASELINE_USERS` / `SPIKE_BASELINE_SECONDS` | 50 / 30 | spike의 평상시 구간 |
| `SPIKE_USERS` / `SPIKE_SECONDS` | 250 / 20 | spike의 급증 구간 (합계 300명) |
| `LOAD_CONNECT_TIMEOUT_MS` | 10000 | 소켓 연결/ACK 대기 상한 |

---

## 중단 기준

### 자동 (`ensure` — 위반 시 artillery가 non-zero로 종료)

`config.ensure`에 넣어 **문서가 아니라 실행되는 검사**로 만들었다. 실행 후 `Checks:` 항목에
ok/fail이 출력되고, 하나라도 fail이면 종료 코드가 1이 된다. **fail이면 다음 단계로 넘어가지
않는다.**

| 검사 | 임계 | 근거 |
|---|---|---|
| `game.socket.ack_ms.p95` | < 500ms | `time:sync` 왕복. 실시간 게임에서 이 이상은 체감된다 |
| `game.round.start_ms.p95` | < 3000ms | `game:ready` → 라운드 시작. 방 락 경합이 가장 먼저 드러나는 지표 (신뢰도 한계는 아래 "측정 지표" 절의 주의사항 참고) |
| `vusers.failed` | < 전체의 1% | VU 완주 실패 |
| `game.socket.concurrent.max` | ≥ 목표의 90% | 목표 부하에 실제로 도달했는가 |

spike는 연결 구간만 본다(`connect_ms.p95 < 3000`, `ack_ms.p95 < 1000`). 급증 구간에는 방마다
인원이 고르게 차지 않아 라운드 진행 지표가 흔들리기 때문이다.

### 수동 — 즉시 중단하고 조사

Artillery 결과와 무관하게, CloudWatch에서 아래가 보이면 **그 단계에서 멈춘다.**

| 신호 | 왜 즉시 중단인가 |
|---|---|
| `RoomLockLeaseLost` > 0 | **분산 락의 상호배제가 깨졌다.** Redis가 락 TTL(8초)보다 오래 응답하지 못했다는 뜻 |
| `StaleFencingWriteRejected` > 0 | 두 워커가 같은 방을 동시에 잡았고, fencing이 쓰기를 막았다. 부하보다 심각한 신호 |
| Redis `Evictions` > 0 | room 상태가 메모리에서 밀려나는 중. **실사용자 방이 사라질 수 있다** |
| `Target5xx` 알람 발생 | 실사용자에게 이미 영향이 가고 있다 |
| EC2 memory > 90% 지속 | OOM으로 프로세스가 죽기 직전 |

`RoomLockLeaseLost` / `StaleFencingWriteRejected`의 배경은
[ADR-0001](../../docs/adr/0001-room-realtime-state-and-reconnect.md)의 "Redis 장애 내성 보강" 참고.

### 수동 — 다음 단계로 올리지 않음

| 신호 | 판단 |
|---|---|
| `game.round.start_ms.p95`가 직전 단계의 2배 초과 | 락 경합이 비선형으로 늘기 시작한 지점일 수 있다 — 단, `USERS_PER_ROOM`도 함께 늘렸다면 아래 주의사항부터 배제하고 판단한다 |
| `game.socket.concurrent.max`가 목표의 90% 미만 | 부하 생성기 또는 서버가 이미 한계. 그 단계 수치는 해석하면 안 된다 |
| `RedisLockFailure` 발생 | 락 획득 자체가 실패하기 시작 |
| `vusers.failed` > 0 (여유 있는 단계에서) | 아직 여유가 있어야 할 구간에서 실패가 나오면 원인을 먼저 찾는다 |

---

## 측정 지표

Artillery 기본:

| 지표 | 의미 |
|---|---|
| `vusers.created` / `completed` / `failed` | VU 생성·완료율 |
| `vusers.session_length` | VU 한 명의 전체 소요시간. `ARRIVAL + HOLD`에 가까워야 정상 |
| `errors.*` | 실패 사유별 집계 (timeout, room:error 등) |

커스텀(최소한만 추가했다):

| 지표 | 의미 |
|---|---|
| **`game.socket.concurrent`** | **1초마다 실측한 동시 소켓 수. max/median으로 실제 도달 부하를 판단** |
| `game.socket.connect_ms` / `connect_ok` | 소켓 연결 지연·성공 |
| `game.socket.enter_ms` / `enter_ok` | `room:enter` → 첫 `room:state`까지 |
| `game.socket.ack_ms` / `ack_ok` | **`time:sync` ACK 왕복** — 순수 소켓 지연을 볼 수 있는 유일한 지점 |
| `game.rest.join_ms` / `join_ok` | REST 입장 지연 |
| `game.round.start_ms` | `game:ready` → 라운드 실제 시작(PLAYING). 락·타이머 경합이 드러난다 (신뢰도 한계는 아래 참고) |
| `game.round.started` / `completed` | 라운드 진행량 |
| `game.session.game_completed` | 세션 중 완주한 게임 판 수 |
| `game.host.start_emitted` / `restart_emitted` | 게임 시작/재시작 횟수 |
| `game.answer.submitted` | 정답 시도 수 |
| `game.vu.completed` / `failed` | VU 게임 완주 여부 |
| `game.room.created` / `create_failed` | 방 생성 결과 |

> **⚠️ `game.round.start_ms`의 신뢰도 한계**
>
> 이 지표는 `game:ready`를 emit한 VU 자신의 시각부터 그 VU가 `room:state`로 `PLAYING`을
> 관측한 시각까지를 잰다(`processors/game.ts`의 LOADING 케이스). 그런데 서버는
> `recomputeReadyStatus`에서 **방 참가자 전원**이 ready여야 `PLAYING`으로 전환한다
> (`apps/game/src/room/room-round.service.ts`) — 즉 이 값은 "이 VU가 얼마나 빨리 준비했나"가
> 아니라 "같은 방에서 가장 늦게 준비한 참가자가 얼마나 걸렸나"로 결정된다.
>
> 각 VU의 "영상 로딩" 대기는 `THINK.videoLoadMs`(400~1200ms) 랜덤값이므로, `USERS_PER_ROOM`을
> 늘리면 N개 랜덤값의 최댓값이 커져 **Redis 락 상태와 무관하게** 이 지표가 함께 올라간다.
> 방 크기를 바꿔가며 여러 단계를 비교하거나(`game-load.yml`처럼 단계별로 인원을 늘리는 시나리오),
> `USERS_PER_ROOM`이 큰 설정에서 이 지표의 절댓값만으로 락 경합을 단정하지 않는다 — 같은
> `USERS_PER_ROOM`끼리만, 그리고 가능하면 CloudWatch의 `RedisLockFailure`/`RoomLockLeaseLost`와
> 함께 봐서 실제 락 문제인지 확인한다. `game-spike.yml`이 이 지표에 `ensure` 임계값을 걸지 않는
> 이유도 같은 근본 원인(참가자별 랜덤 대기가 인원수에 따라 흔들림) 때문이다.
>
> 더 정확히 보려면(추후 과제): 서버가 `beginRound()`에서 세팅하는
> `currentRound.playScheduledAt`(= 전환 완료 시각 + `PLAY_SCHEDULE_DELAY_SECONDS`, 기본 1.8초)을
> 역산해 "서버가 락 안에서 전환을 완료한 시각"을 구하고, 그 방에서 마지막으로 emit된
> `game:ready` 시각과의 차이로 다시 정의하면 다른 참가자의 영상 로딩 대기를 완전히 배제할 수
> 있다(로드 제너레이터-서버 간 시계 오차는 `time:sync` ACK로 offset을 구해 보정).

---

## CloudWatch와 함께 볼 것

**부하 테스트 결과만 보고 병목을 단정하지 않는다.** Artillery 지표가 나빠졌을 때 원인을 찾으려면
`SongQuiz-Prod` 대시보드를 같은 시간대로 맞춰 함께 본다.

```text
Game/API      RequestCount / TargetResponseTime / Target5xx
EC2           CPUUtilization / mem_used_percent
Redis         CurrConnections / DatabaseMemoryUsagePercentage / Evictions
Game 앱       RedisLockFailure / QuizSnapshotFailure / TimerClaimFailure
              RoomLockLeaseLost / StaleFencingWriteRejected
RDS           CPUUtilization / DatabaseConnections
```

해석 힌트:

- `game.round.start_ms`가 늘고 `RedisLockFailure`가 함께 오르면 → 방 락 경합
- `Redis CurrConnections`가 단계별 동시 접속과 비례해 오르지 않으면 → 연결 재사용/누수 확인
- `Evictions > 0` → room 상태가 밀려나는 중. TTL/메모리 재검토 신호
- Artillery 지표는 멀쩡한데 `TargetResponseTime`만 오르면 → REST(입장) 경로가 먼저 막히는 중

---

## 로컬에서 돌리기

game 서버와, game이 호출하는 apps/api의 `/internal/quizzes/*`가 필요하다.

```bash
yarn api:local     # 터미널 1 (MySQL 필요)
yarn game:local    # 터미널 2
yarn load:smoke    # 터미널 3
```

끝나면 서버 프로세스를 종료한다(포트 점유/좀비 프로세스 방지 — `apps/game/CLAUDE.md`).

---

## Production에서 돌릴 때 주의

1. **먼저 smoke로 흐름만 확인한다.** 동시 10명이라 실부하가 되지 않는다.
2. **트래픽이 적은 시간대에 한다.** 이 테스트는 실제 방을 만들고 실제 게임을 진행시킨다.
3. 테스트 방은 `isUnlisted: true`, 제목은 `[loadtest] ...`로 생성되어 **실사용자 방 목록에
   노출되지 않는다.** 그래도 Redis 메모리와 room 인덱스는 실제로 사용한다.
4. **VU가 중간에 죽으면 방이 남는다.** 참가자가 0이 되어야 방이 지워지는데, 강제 종료(Ctrl+C)하면
   `room:leave` 없이 끊겨 `disconnect-grace`(10초) 후에야 정리된다. 방 TTL은 6시간이다.
5. 실행 전후로 위 CloudWatch 지표의 baseline을 캡처해둔다. 비교 대상이 없으면 숫자를 해석할 수 없다.
6. **단계를 건너뛰지 않는다.** 25 → 50 → 100 → 200 → 300 순서로, 매번 중단 기준을 확인한다.

---

## 알려진 한계

- **`WORKERS=1`로 고정되어 있다.** Artillery의 `before` 훅은 VU 워커와 다른 프로세스에서 돌아
  방 배정 상태를 공유할 수 없다. 워커가 여럿이면 같은 방에 방장이 여러 명 뽑혀 동일한
  `userId`로 중복 접속하는 잘못된 상태가 된다. VU는 대부분 이벤트를 기다리는 I/O 대기라 워커
  하나로도 수백 명은 감당하지만, **300명 근처부터는 부하 생성기 쪽이 먼저 한계에 닿을 수
  있다.** `game.socket.concurrent.max`가 목표에 못 미치면 그것을 의심한다 — 서버가 아니라
  테스트가 못 따라간 것일 수 있고, 그때는 주입기를 여러 대로 나눠야 한다(이번 범위 밖).
- VU는 정답을 모르므로 대부분 오답을 낸다. 정답 채점 경로(`normalizeAnswer` 비교, 점수 계산)는
  거의 타지 않는다. 정답 부하를 재현하려면 퀴즈 정답을 테스트가 알아야 하는데, 그러면
  테스트가 퀴즈 데이터에 결합된다.
- 라운드는 30초 제한시간을 기다리지 않고 **과반 스킵**으로 넘긴다. 실제로도 흔한 경로지만,
  라운드 타임아웃 타이머(`RoomTimerService`) 부하는 상대적으로 덜 재현된다.
- 램프업 구간(`LOAD_ARRIVAL_SECONDS`)에는 동시 접속이 목표보다 낮다. 지표의 `median`이 아니라
  `max`가 목표에 도달했는지를 먼저 보고, `median`으로 "유지되었는지"를 본다.
