/**
 * Artillery processor — apps/game의 Socket.IO 게임 흐름을 Virtual User가 실제로 수행한다.
 *
 * ## 이 테스트가 "동시 접속" 기준인 이유
 *
 * Artillery의 arrivalRate/arrivalCount는 "새로 도착한 VU 수"(누적)이지 "지금 붙어 있는 소켓
 * 수"가 아니다. 둘의 관계는 Little's Law를 따른다.
 *
 *     동시 접속 ≈ 도착률 × 세션 길이
 *
 * 즉 60초에 걸쳐 100명을 투입해도 각 VU가 26초만 살면 실제 동시 접속은 약 43명에 그친다.
 * 그래서 이 processor는 VU를 "정해진 시각(holdUntil)까지 소켓을 붙잡고 계속 플레이하는"
 * 모델로 만든다. 게임이 끝나면 방장이 game:restart로 다음 판을 시작해 세션을 이어간다.
 * 램프업이 끝난 뒤부터 holdUntil까지는 투입한 VU 수가 그대로 동시 접속 수가 된다.
 *
 * 그리고 그 수를 추측하지 않고 `game.socket.concurrent` 지표로 1초마다 실측한다.
 *
 * ## Artillery의 socketio 엔진을 쓰지 않은 이유
 *
 * apps/game은 ACK 기반이 아니라 broadcast 기반이다. 반환값(ACK)을 주는 핸들러는 `time:sync`
 * 하나뿐이고(handleTimeSync) 나머지는 전부 `room:state` 브로드캐스트로 응답한다. socketio
 * 엔진의 emit/response 매칭으로는 "다음 라운드가 시작될 때까지 기다린다"를 표현할 수 없어
 * 고정 sleep으로 상태를 추측하게 되는데, 그러면 서버가 느려져도 부하가 같이 느려지지 않아
 * 측정이 왜곡된다. 그래서 상태 전이를 실제로 기다리는 코드를 직접 쓴다.
 *
 * 실제 이벤트/페이로드는 전부 코드에서 확인한 것이다:
 * - namespace: '/rooms'                       (room.gateway.ts @WebSocketGateway)
 * - room:enter { roomId, userId, accessToken } (handleEnter)
 * - time:sync  { clientSentAt } -> ACK { serverTime } (handleTimeSync, 유일한 ACK)
 * - game:start / game:ready / game:skip / game:next-round / game:restart / room:leave (payload 없음)
 * - chat:message { message }                   (정답 제출도 이 이벤트다 - 별도 answer 이벤트 없음)
 * - 서버 -> 클라이언트: room:state / chat:message / chat:system / chat:history / room:error
 */
import { io, Socket } from 'socket.io-client';

// ── Artillery가 넘겨주는 최소 타입만 정의한다(artillery 타입 패키지에 의존하지 않기 위함).
interface ArtilleryEvents {
  emit(type: 'counter', name: string, value: number): void;
  emit(type: 'histogram', name: string, value: number): void;
}
interface ArtilleryContext {
  vars: Record<string, unknown>;
}

// ── 설정: 전부 환경변수로 덮어쓸 수 있다. 기본값은 "로컬에서 안전하게 돌아가는 작은 값"이다.
const TARGET = process.env.LOAD_TARGET ?? 'http://localhost:8002';
const QUIZ_ID = process.env.LOAD_QUIZ_ID ?? '1';
const USERS_PER_ROOM = Number(process.env.LOAD_USERS_PER_ROOM ?? 5);
/**
 * 만들 방 개수. 기본은 "목표 동시 접속 / 방당 인원"으로 계산한다 - 세 값을 각자 적다가
 * 어긋나면 방이 덜 차서 게임이 시작되지 않으므로, 사람이 세는 대신 여기서 유도한다.
 * spike는 baseline + 급증 인원이 전부 들어가야 하므로 그 합을 쓴다.
 * LOAD_ROOMS를 직접 주면 그 값이 우선한다(비정상 분포를 일부러 만들고 싶을 때).
 */
const TOTAL_USERS =
  Number(process.env.LOAD_CONCURRENT_USERS ?? 0) ||
  Number(process.env.SPIKE_BASELINE_USERS ?? 0) +
    Number(process.env.SPIKE_USERS ?? 0) ||
  USERS_PER_ROOM;
const ROOMS = Number(
  process.env.LOAD_ROOMS ?? Math.max(1, Math.ceil(TOTAL_USERS / USERS_PER_ROOM)),
);
/** 한 게임의 라운드 수. 게임이 끝나면 방장이 재시작하므로 세션 길이와는 무관하다. */
const SONG_LIMIT = Number(process.env.LOAD_SONG_LIMIT ?? 3);
/** VU 전원을 투입하는 데 걸리는 시간. 짧을수록 목표 동시 접속에 빨리 도달한다. */
const ARRIVAL_SECONDS = Number(process.env.LOAD_ARRIVAL_SECONDS ?? 20);
/** 램프업이 끝난 뒤 목표 동시 접속을 유지하는 시간. 실제 측정 구간이다. */
const HOLD_SECONDS = Number(process.env.LOAD_HOLD_SECONDS ?? 180);
/** 상태 전이 하나를 기다리는 상한. 서버가 느려지면 이 값에 걸려 실패로 기록된다. */
const STATE_TIMEOUT_MS = Number(process.env.LOAD_STATE_TIMEOUT_MS ?? 30_000);
const CONNECT_TIMEOUT_MS = Number(process.env.LOAD_CONNECT_TIMEOUT_MS ?? 10_000);
/** 동시 접속 수를 실측해 기록하는 주기. */
const CONCURRENCY_SAMPLE_MS = 1_000;

/** 실제 사용자 행동에 가까운 대기. 고정 sleep이 아니라 범위 안 랜덤이다. */
const THINK = {
  videoLoadMs: [400, 1_200],
  beforeAnswerMs: [1_000, 3_000],
  beforeSkipMs: [1_500, 4_000],
  beforeNextRoundMs: [800, 2_000],
  beforeRestartMs: [1_000, 2_500],
} as const;

interface Credentials {
  userId: string;
  accessToken: string;
}
interface RoomSlot {
  roomId: string;
  /** 방 생성자(=방장) 자격. 이 방의 첫 VU가 그대로 사용한다. */
  host: Credentials;
  hostClaimed: boolean;
  joined: number;
}
interface RoomState {
  roomId: string;
  gameStatus: 'WAITING' | 'LOADING' | 'PLAYING' | 'ROUND_ENDED' | 'FINISHED';
  participants: { userId: string }[];
  currentRound: { roundIndex: number; revealed: boolean } | null;
}

/**
 * VU 간에 공유되는 방 풀.
 *
 * before 훅은 VU 워커와 "다른 프로세스"에서 실행되므로 모듈 스코프 변수로는 넘길 수 없다.
 * 방 목록 자체는 context.vars로 직렬화되어 워커에 전달되고, 배정 상태(누가 방장인지, 몇 명이
 * 들어갔는지)는 워커 안에서만 유지한다. 그래서 이 스크립트들은 WORKERS=1로 실행한다 -
 * 워커가 여러 개면 각 워커가 같은 방에 대해 따로 방장을 뽑아, 여러 VU가 동일한 방장
 * 자격(같은 userId)으로 접속하는 잘못된 상태가 된다.
 */
let roomPool: RoomSlot[] = [];
let assignCursor = 0;

/** 지금 이 순간 실제로 붙어 있는 소켓 수. 동시 접속 실측의 기준이다. */
let liveSockets = 0;
let concurrencySampler: NodeJS.Timeout | undefined;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const randomBetween = ([min, max]: readonly [number, number]) =>
  min + Math.random() * (max - min);
const think = (range: readonly [number, number]) => sleep(randomBetween(range));

/**
 * 1초마다 현재 소켓 수를 histogram으로 남긴다. Artillery에는 gauge가 없어 histogram으로
 * 대신하며, 리포트의 max/p95를 "실제로 도달한 동시 접속 수"로 읽으면 된다.
 */
function startConcurrencySampler(events: ArtilleryEvents): void {
  if (concurrencySampler) {
    return;
  }
  concurrencySampler = setInterval(() => {
    events.emit('histogram', 'game.socket.concurrent', liveSockets);
  }, CONCURRENCY_SAMPLE_MS);
  // 샘플러 때문에 워커가 종료되지 못하는 일이 없도록 한다.
  concurrencySampler.unref();
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${TARGET}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`POST ${path} -> ${response.status} ${text.slice(0, 200)}`);
  }
  return (await response.json()) as T;
}

/**
 * before 훅에서 1회만 실행된다. 부하 테스트 전용 API를 새로 만들지 않고 기존 공개 REST
 * (POST /rooms)를 그대로 쓴다. isUnlisted: true로 만들어 테스트 방이 실서비스 방 목록에
 * 노출되지 않게 한다.
 */
export async function createRoomPool(
  context: ArtilleryContext,
  events: ArtilleryEvents,
): Promise<void> {
  const created: { roomId: string; host: Credentials }[] = [];

  try {
    for (let i = 0; i < ROOMS; i++) {
      const room = await postJson<{
        room: { roomId: string };
        userId: string;
        accessToken: string;
      }>('/rooms', {
        roomTtl: `[loadtest] room-${i + 1}-${Date.now()}`,
        quizId: QUIZ_ID,
        isRandom: true,
        speedModeEnabled: false,
        // 방장 1명 + 참가자들이 모두 들어갈 수 있어야 한다(서버 상한 50).
        maxUserCnt: Math.min(50, Math.max(2, USERS_PER_ROOM)),
        songLimit: SONG_LIMIT,
        nickname: `host-${i + 1}`,
        isUnlisted: true,
      });

      created.push({
        roomId: room.room.roomId,
        host: { userId: room.userId, accessToken: room.accessToken },
      });
      events.emit('counter', 'game.room.created', 1);
    }

    // 워커 프로세스로 전달되는 유일한 경로다(모듈 스코프는 프로세스를 넘지 못한다).
    context.vars.roomPool = created;
    // 모든 VU가 같은 시각에 빠져나가도록 종료 시각을 공유한다. 그래야 동시 접속 그래프가
    // 계단이 아니라 사각형이 되어 "N명을 유지했다"고 말할 수 있다.
    context.vars.holdUntil = Date.now() + (ARRIVAL_SECONDS + HOLD_SECONDS) * 1000;

    console.log(
      `[load] ${created.length}개 방 생성 완료 | 방당 ${USERS_PER_ROOM}명 | ` +
        `목표 동시 접속 ${created.length * USERS_PER_ROOM}명 | ` +
        `램프업 ${ARRIVAL_SECONDS}s + 유지 ${HOLD_SECONDS}s`,
    );
  } catch (err) {
    events.emit('counter', 'game.room.create_failed', 1);
    throw err;
  }
}

/** 워커에서 첫 VU가 실행될 때 context.vars로 전달받은 방 목록을 배정용 상태로 펼친다. */
function ensureRoomPool(context: ArtilleryContext): void {
  if (roomPool.length > 0) {
    return;
  }
  const serialized = context.vars.roomPool as
    | { roomId: string; host: Credentials }[]
    | undefined;
  if (!serialized || serialized.length === 0) {
    throw new Error(
      '방 풀이 비어 있다. before 훅(createRoomPool)이 실행되지 않았거나 실패했다.',
    );
  }
  roomPool = serialized.map((entry) => ({
    roomId: entry.roomId,
    host: entry.host,
    hostClaimed: false,
    joined: 0,
  }));
}

/** 라운드로빈으로 방을 배정한다 - 한 방에 사용자가 몰리지 않게 하기 위함이다. */
function assignSlot(context: ArtilleryContext): {
  slot: RoomSlot;
  isHost: boolean;
  seat: number;
} {
  ensureRoomPool(context);
  const slot = roomPool[assignCursor % roomPool.length];
  assignCursor += 1;
  const isHost = !slot.hostClaimed;
  if (isHost) {
    slot.hostClaimed = true;
  }
  const seat = slot.joined;
  slot.joined += 1;
  return { slot, isHost, seat };
}

/**
 * 소켓 하나의 room:state를 상시 추적한다.
 *
 * 매번 새로 리스너를 붙였다 떼는 방식은 "이전 대기가 resolve된 뒤 다음 리스너를 붙이기
 * 전"에 도착한 상태를 통째로 놓친다. 놓친 것이 LOADING이면 그 VU는 game:ready를 영영
 * 보내지 않고, 전원 ready여야 라운드가 시작되므로(recomputeReadyStatus) 그 방의 모든 VU가
 * 함께 멈춘다. 그래서 입장 직후 리스너를 한 번만 붙여 최신 상태를 계속 들고 있고,
 * 대기 요청이 오면 이미 도달한 상태부터 먼저 확인한다.
 */
class RoomStateTracker {
  private latest: RoomState | undefined;
  private lastError: string | undefined;
  private readonly waiters = new Set<(room: RoomState) => void>();

  constructor(socket: Socket) {
    socket.on('room:state', (room: RoomState) => {
      this.latest = room;
      for (const notify of [...this.waiters]) {
        notify(room);
      }
    });
    socket.on('room:error', (payload: { message?: string }) => {
      this.lastError = payload?.message ?? 'unknown';
    });
  }

  get current(): RoomState | undefined {
    return this.latest;
  }

  wait(
    predicate: (room: RoomState) => boolean,
    label: string,
    timeoutMs = STATE_TIMEOUT_MS,
  ): Promise<RoomState> {
    // 기다리려는 상태에 이미 도달해 있으면 그대로 쓴다(전이를 놓치지 않기 위한 핵심).
    if (this.latest && predicate(this.latest)) {
      return Promise.resolve(this.latest);
    }
    return new Promise((resolve, reject) => {
      const notify = (room: RoomState) => {
        if (predicate(room)) {
          cleanup();
          resolve(room);
        }
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(
          new Error(
            `timeout(${label}) after ${timeoutMs}ms` +
              (this.lastError ? ` lastRoomError=${this.lastError}` : ''),
          ),
        );
      }, timeoutMs);
      const cleanup = () => {
        clearTimeout(timer);
        this.waiters.delete(notify);
      };
      this.waiters.add(notify);
    });
  }
}

/**
 * Virtual User 한 명. 소켓을 열고 holdUntil까지 계속 게임을 진행하며 연결을 유지한다.
 * 게임이 끝나면(FINISHED) 방장이 game:restart로 다음 판을 시작한다.
 */
export async function playGame(
  context: ArtilleryContext,
  events: ArtilleryEvents,
): Promise<void> {
  let socket: Socket | undefined;
  let counted = false;
  const { slot, isHost, seat } = assignSlot(context);
  const holdUntil = Number(
    context.vars.holdUntil ?? Date.now() + HOLD_SECONDS * 1000,
  );
  startConcurrencySampler(events);

  /** 남은 유지 시간에 맞춰 대기 상한을 줄인다. 종료 직전의 대기가 실패로 잡히지 않게 한다. */
  const waitBudget = () =>
    Math.max(1_000, Math.min(STATE_TIMEOUT_MS, holdUntil - Date.now() + 5_000));

  try {
    // ── 1. 자격 확보: 방장은 생성 시 발급받은 것을 쓰고, 나머지는 기존 공개 REST로 입장한다.
    let creds: Credentials;
    if (isHost) {
      creds = slot.host;
    } else {
      const startedAt = Date.now();
      const joined = await postJson<{ userId: string; accessToken: string }>(
        `/rooms/${slot.roomId}/join`,
        { nickname: `vu-${seat}-${Math.random().toString(36).slice(2, 7)}` },
      );
      events.emit('histogram', 'game.rest.join_ms', Date.now() - startedAt);
      events.emit('counter', 'game.rest.join_ok', 1);
      creds = { userId: joined.userId, accessToken: joined.accessToken };
    }
    context.vars.roomId = slot.roomId;
    context.vars.userId = creds.userId;

    // ── 2. Socket.IO 연결. 부하 테스트에서는 재연결을 끄고 실패를 그대로 드러낸다
    //      (apps/web은 재연결을 켜지만, 여기서 켜면 연결 실패가 지표에서 사라진다).
    const connectStartedAt = Date.now();
    socket = io(`${TARGET}/rooms`, {
      transports: ['websocket'],
      reconnection: false,
      timeout: CONNECT_TIMEOUT_MS,
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`socket connect timeout ${CONNECT_TIMEOUT_MS}ms`)),
        CONNECT_TIMEOUT_MS,
      );
      socket!.once('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      socket!.once('connect_error', (err: Error) => {
        clearTimeout(timer);
        reject(new Error(`socket connect_error: ${err.message}`));
      });
    });
    liveSockets += 1;
    counted = true;
    events.emit(
      'histogram',
      'game.socket.connect_ms',
      Date.now() - connectStartedAt,
    );
    events.emit('counter', 'game.socket.connect_ok', 1);

    // ── 3. room:enter -> 서버가 이 소켓에게 보내는 room:state를 기다린다.
    const tracker = new RoomStateTracker(socket);
    const enterStartedAt = Date.now();
    socket.emit('room:enter', {
      roomId: slot.roomId,
      userId: creds.userId,
      accessToken: creds.accessToken,
    });
    await tracker.wait(() => true, 'room:enter');
    events.emit('histogram', 'game.socket.enter_ms', Date.now() - enterStartedAt);
    events.emit('counter', 'game.socket.enter_ok', 1);

    // ── 4. time:sync — 서버에서 유일하게 ACK를 반환하는 핸들러라, 순수한 소켓 왕복
    //      지연(p50/p95/p99)을 측정할 수 있는 유일한 지점이다.
    const ackStartedAt = Date.now();
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('time:sync ACK timeout')),
        CONNECT_TIMEOUT_MS,
      );
      socket!.emit('time:sync', { clientSentAt: Date.now() }, () => {
        clearTimeout(timer);
        resolve();
      });
    });
    events.emit('histogram', 'game.socket.ack_ms', Date.now() - ackStartedAt);
    events.emit('counter', 'game.socket.ack_ok', 1);

    // ── 5. holdUntil까지 게임을 계속 진행한다. 상태 전이는 전부 서버가 보내는
    //      room:state를 기준으로 판단하고, 각 상태에서 할 일을 한 뒤 상태가 바뀌길 기다린다.
    let startEmitted = false;
    while (Date.now() < holdUntil) {
      const state = tracker.current;
      if (!state) {
        break;
      }

      try {
        switch (state.gameStatus) {
          case 'WAITING': {
            if (isHost && !startEmitted) {
              // 인원이 다 모이면 시작한다. 다 모이지 않아도 예산이 끝나면 그냥 시작해본다.
              await tracker
                .wait(
                  (room) => room.participants.length >= USERS_PER_ROOM,
                  'participants-gathered',
                  Math.min(15_000, waitBudget()),
                )
                .catch(() => undefined);
              socket.emit('game:start');
              startEmitted = true;
              events.emit('counter', 'game.host.start_emitted', 1);
            }
            await tracker.wait(
              (room) => room.gameStatus !== 'WAITING',
              'leave-waiting',
              waitBudget(),
            );
            break;
          }

          case 'LOADING': {
            // 영상 로딩을 흉내낸 뒤 ready. 전원 ready여야 라운드가 시작된다.
            await think(THINK.videoLoadMs);
            const readyAt = Date.now();
            socket.emit('game:ready');
            const next = await tracker.wait(
              (room) => room.gameStatus !== 'LOADING',
              'leave-loading',
              waitBudget(),
            );
            if (next.gameStatus === 'PLAYING') {
              events.emit(
                'histogram',
                'game.round.start_ms',
                Date.now() - readyAt,
              );
              events.emit('counter', 'game.round.started', 1);
            }
            break;
          }

          case 'PLAYING': {
            // 정답 시도. VU는 정답을 모르므로 대부분 오답이다 — 실제 플레이와 같고,
            // 퀴즈 정답 데이터를 테스트가 알 필요도 없다.
            await think(THINK.beforeAnswerMs);
            socket.emit('chat:message', {
              message: `guess-${seat}-${Date.now()}`,
            });
            events.emit('counter', 'game.answer.submitted', 1);

            // 아무도 못 맞히면 라운드는 30초 제한시간까지 간다. 실제로도 흔한
            // "포기 후 스킵"(과반) 경로로 넘겨 부하가 제한시간에 묶이지 않게 한다.
            await think(THINK.beforeSkipMs);
            socket.emit('game:skip');
            await tracker.wait(
              (room) => room.gameStatus !== 'PLAYING',
              'leave-playing',
              waitBudget(),
            );
            events.emit('counter', 'game.round.completed', 1);
            break;
          }

          case 'ROUND_ENDED': {
            if (isHost) {
              await think(THINK.beforeNextRoundMs);
              socket.emit('game:next-round');
            }
            await tracker.wait(
              (room) => room.gameStatus !== 'ROUND_ENDED',
              'leave-round-ended',
              waitBudget(),
            );
            break;
          }

          case 'FINISHED': {
            // 세션을 계속 유지하기 위해 방장이 같은 방/설정으로 다시 시작한다.
            events.emit('counter', 'game.session.game_completed', 1);
            if (isHost) {
              await think(THINK.beforeRestartMs);
              socket.emit('game:restart');
              events.emit('counter', 'game.host.restart_emitted', 1);
            }
            await tracker.wait(
              (room) => room.gameStatus !== 'FINISHED',
              'leave-finished',
              waitBudget(),
            );
            break;
          }
        }
      } catch (err) {
        // 유지 시간이 끝나서 기다리다 만 것은 실패가 아니라 정상 종료다.
        if (Date.now() >= holdUntil) {
          break;
        }
        throw err;
      }
    }

    // ── 6. 명시적 퇴장 후 연결 종료.
    socket.emit('room:leave');
    await sleep(200); // room:leave가 서버에 도달할 시간을 준다(즉시 끊으면 유실될 수 있다).
    liveSockets -= 1;
    counted = false;
    socket.disconnect();
    events.emit('counter', 'game.vu.completed', 1);
  } catch (err) {
    events.emit('counter', 'game.vu.failed', 1);
    if (counted) {
      liveSockets -= 1;
    }
    try {
      socket?.disconnect();
    } catch {
      // 정리 실패는 원래 오류를 가리지 않는다.
    }
    // Artillery는 async processor가 던진 오류를 VU 실패로 기록한다(vusers.failed).
    throw err;
  }
}
