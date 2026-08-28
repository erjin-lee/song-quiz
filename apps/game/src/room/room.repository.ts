import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { CacheService } from '../cache/cache.service';
import { delay } from '../common/delay';
import { QuizRoundData } from './clients/quiz.client';
import { RoomItemDto } from './dto/room-item.dto';
import { RoomLockService, StaleFencingWriteError } from './room-lock.service';

/**
 * 비밀방 비밀번호 대입 시도 제한. 공개방 입장이나 성공한 입장까지 함께 제한되지
 * 않도록, "실패한 비밀번호 시도"만 방(roomId) + 요청 IP 기준으로 집계한다.
 */
const PASSWORD_ATTEMPT_LIMIT = 5;
const PASSWORD_ATTEMPT_WINDOW_SECONDS = 60;

/**
 * 공개 POST /rooms는 비로그인 게스트도 호출할 수 있고, isPrivate방은 생성마다
 * bcrypt.hash까지 돈다. IP당 방 생성 빈도를 제한해 반복 호출로 CPU(bcrypt)와
 * Redis(room 레코드 + index) 소비를 무한히 늘리는 것을 막는다.
 */
const ROOM_CREATION_LIMIT = 10;
const ROOM_CREATION_WINDOW_SECONDS = 60;
const ROOM_CREATION_CACHE_KEY_PREFIX = 'room:create-attempts:';

/**
 * INCR과 최초 1회의 EXPIRE를 한 Lua 실행으로 묶는다. GET → +1 → SET처럼 나누면 동시
 * 요청이 모두 같은 이전 값을 읽고 통과할 수 있어(단일 프로세스 안에서도 await 사이에
 * 요청이 교차한다), rate limit 자체가 우회된다.
 */
const INCR_WITH_EXPIRE_SCRIPT = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
end
return count
`;

/** room:index PERSIST 마이그레이션 재시도 한도(부팅 직후 Redis가 아직 준비되지 않았을 수 있어서). */
const INDEX_TTL_MIGRATION_MAX_ATTEMPTS = 5;
const INDEX_TTL_MIGRATION_RETRY_MS = 1_000;

const ROOM_INDEX_CACHE_KEY = 'room:index';
/** room:index read-modify-write를 인스턴스 간에 직렬화하기 위한 락 키. */
const ROOM_INDEX_LOCK_KEY = 'room-index';
/**
 * room 본체는 활동마다 TTL이 갱신되는 sliding TTL이지만, room:index는 room 하나하나의
 * 활동을 알 방법이 없다. 예전처럼 index에도 ROOM_TTL_SECONDS를 걸면, 방 생성/삭제 없이
 * 활동만 오래 이어질 때 index가 먼저 만료되어 살아있는 방이 전부 목록에서 사라지는
 * 문제가 생긴다. 그래서 index는 만료시키지 않고(0 = 영구), addToIndex/removeFromIndex로
 * 항목 단위로만 정합성을 맞춘다. 방이 TTL로 자연 만료돼 removeFromIndex 경로를 타지
 * 못한 stale entry는 RoomService.getRooms가 조회 시점에 걸러내며 정리한다.
 */
const ROOM_INDEX_TTL_SECONDS = 0;
const ROOM_CACHE_KEY_PREFIX = 'room:';
const PASSWORD_ATTEMPT_CACHE_KEY_PREFIX = 'room:pwd-attempts:';
const SONG_ORDER_CACHE_KEY_PREFIX = 'room:song-order:';
const ROUNDS_SNAPSHOT_CACHE_KEY_PREFIX = 'room:rounds:';
const CURRENT_ANSWERS_CACHE_KEY_PREFIX = 'room:answers:';
const CURRENT_REVEAL_CACHE_KEY_PREFIX = 'room:reveal:';
const CHAT_HISTORY_CACHE_KEY_PREFIX = 'room:chat:';
/** 방은 활동(생성/입장/퇴장/게임 진행)이 있을 때마다 TTL이 갱신되는 슬라이딩 방식이다. */
export const ROOM_TTL_SECONDS = 6 * 60 * 60;
/** roomId별로 보관하는 채팅 히스토리 최대 개수. 초과분은 오래된 것부터 버린다. */
const CHAT_HISTORY_MAX_ENTRIES = Number(
  process.env.CHAT_HISTORY_MAX_ENTRIES ?? 100,
);

/**
 * roomId별 상태를 보호하는 락 키. RoomService.withRoomLock이 잡는 키와 저장소가
 * fencing 범위를 대조할 때 쓰는 키가 반드시 같아야 해서, 양쪽이 각자 문자열을
 * 조립하지 않고 이 함수 하나만 쓴다.
 */
export function roomLockKey(roomId: string): string {
  return `room:${roomId}`;
}

export interface ChatHistoryEntry {
  type: 'message' | 'system';
  nickname?: string;
  message: string;
  sentAt: string;
}

/**
 * 캐시에 저장하는 내부 표현. pwdHash는 절대 클라이언트로 나가면 안 되므로(비밀방
 * 비밀번호 해시가 노출되면 오프라인 대입 공격이 가능해진다), RoomItemDto(공개 응답
 * 타입)에는 포함하지 않고 이 내부 타입에만 둔다. toPublicRoom을 거치지 않은 값을
 * 절대 컨트롤러 반환값/소켓 브로드캐스트로 내보내지 않는다.
 */
export type RoomRecord = RoomItemDto & { pwdHash: string | null };

/**
 * room 도메인의 Redis 저장소 접근 계층. room 레코드/인덱스/songOrder/라운드 스냅샷/
 * 현재 정답·공개/채팅 히스토리/비밀번호 시도 횟수의 get·set·delete와 캐시 키 생성만
 * 담당한다. 라운드 진행 오케스트레이션(RoomService)이 이 계층을 호출한다.
 */
@Injectable()
export class RoomRepository implements OnModuleInit {
  private readonly logger = new Logger(RoomRepository.name);

  /**
   * roomId -> 최근 채팅/시스템 메시지 히스토리(재접속 시 복원용, 최대 CHAT_HISTORY_MAX_ENTRIES개).
   * Redis가 설정돼 있으면 Redis LIST(room:chat:<roomId>)를 우선 사용하고, 이 Map은
   * append/조회 시점에 Redis 커맨드가 실패할 때만 쓰는 로컬 폴백 저장소로 남겨둔다.
   */
  private readonly chatHistory = new Map<string, ChatHistoryEntry[]>();

  /**
   * clientIp -> 방 생성 카운터(REDIS_HOST 미설정이거나 Redis가 순간 응답하지 못할 때의
   * 폴백). 단일 프로세스 내 Map 연산은 await 없이 동기로 끝나므로 그 자체로 원자적이다.
   */
  private readonly localRoomCreationCounts = new Map<
    string,
    { count: number; resetAt: number }
  >();

  constructor(
    private readonly cacheService: CacheService,
    private readonly roomLockService: RoomLockService,
  ) {}

  /**
   * 배포 전에 room:index에 걸려있던 sliding TTL(최대 6h)이 남아있으면, 이번 배포로
   * index를 영구 키로 바꿔도 그 TTL이 그대로 살아 한 번 더 만료될 수 있다. 부팅마다
   * PERSIST를 시도해 제거한다 — PERSIST는 멱등이라 이미 영구이거나 키가 없어도 안전하다.
   * 부팅을 막지 않도록 기다리지 않고, Redis가 아직 준비되지 않았을 수 있는 초기 구간은
   * 짧게 재시도한다.
   */
  onModuleInit(): void {
    void this.persistLegacyRoomIndexTtl(1);
  }

  private async persistLegacyRoomIndexTtl(attempt: number): Promise<void> {
    const redis = this.cacheService.getRedisClient();
    if (!redis) {
      return;
    }
    try {
      await redis.persist(ROOM_INDEX_CACHE_KEY);
    } catch (err) {
      if (attempt >= INDEX_TTL_MIGRATION_MAX_ATTEMPTS) {
        this.logger.warn(
          `room:index의 기존 TTL 제거(마이그레이션)에 실패했습니다. 다음 재시작 시 다시 시도됩니다: ${(err as Error).message}`,
        );
        return;
      }
      await delay(INDEX_TTL_MIGRATION_RETRY_MS * attempt);
      await this.persistLegacyRoomIndexTtl(attempt + 1);
    }
  }

  /**
   * 채팅/시스템 메시지를 히스토리에 기록한다(재접속 시 복원용). 방 상태와 무관해 락을 타지 않는다.
   * 이 오퍼레이션은 스케줄/취소처럼 짝을 이루지 않는 단발성 append이므로, 매 호출 시점의
   * Redis 연결 상태(isRedisReady)로 그때그때 폴백해도 안전하다(RoomLockService/RoomTimerService의
   * "모드 고정" 원칙과 달리 append/조회가 서로 다른 백엔드를 타도 최악의 경우 최근 몇 건의
   * 순서만 어긋날 뿐 게임 상태 정합성에는 영향이 없다).
   * RPUSH+LTRIM+EXPIRE를 MULTI/EXEC로 묶어 여러 인스턴스에서 동시에 append해도 Redis의
   * 단일 스레드 실행 모델상 원자적으로 처리된다.
   */
  async appendChatHistory(
    roomId: string,
    entry: ChatHistoryEntry,
  ): Promise<void> {
    const redis = this.cacheService.getRedisClient();
    if (redis && this.cacheService.isRedisReady()) {
      try {
        const key = this.chatHistoryKey(roomId);
        await redis
          .multi()
          .rpush(key, JSON.stringify(entry))
          .ltrim(key, -CHAT_HISTORY_MAX_ENTRIES, -1)
          .expire(key, ROOM_TTL_SECONDS)
          .exec();
        return;
      } catch (err) {
        this.logger.warn(
          `채팅 히스토리 Redis 기록 실패(${roomId}), 로컬 메모리로 폴백합니다: ${(err as Error).message}`,
        );
      }
    }

    const history = this.chatHistory.get(roomId) ?? [];
    history.push(entry);
    if (history.length > CHAT_HISTORY_MAX_ENTRIES) {
      history.splice(0, history.length - CHAT_HISTORY_MAX_ENTRIES);
    }
    this.chatHistory.set(roomId, history);
  }

  /** roomId의 채팅 히스토리를 조회한다(재접속 시 복원용). */
  async getChatHistory(roomId: string): Promise<ChatHistoryEntry[]> {
    const redis = this.cacheService.getRedisClient();
    if (redis && this.cacheService.isRedisReady()) {
      try {
        const raw = await redis.lrange(this.chatHistoryKey(roomId), 0, -1);
        return raw.map((entry) => JSON.parse(entry) as ChatHistoryEntry);
      } catch (err) {
        this.logger.warn(
          `채팅 히스토리 Redis 조회 실패(${roomId}), 로컬 메모리로 폴백합니다: ${(err as Error).message}`,
        );
      }
    }
    return this.chatHistory.get(roomId) ?? [];
  }

  async deleteChatHistory(roomId: string): Promise<void> {
    await this.cacheService.del(this.chatHistoryKey(roomId));
    this.chatHistory.delete(roomId);
  }

  private chatHistoryKey(roomId: string): string {
    return `${CHAT_HISTORY_CACHE_KEY_PREFIX}${roomId}`;
  }

  /** pwdHash를 포함한 내부 표현을 반환한다. 응답/브로드캐스트 직전에는 반드시 toPublicRoom을 거쳐야 한다. */
  /**
   * 캐시에서 읽은 값을 그대로 신뢰하지 않고, 배포 전에 만들어진(비공개방/비밀방 기능
   * 추가 이전) 방 데이터에 없는 필드를 기본값으로 보정한다. 보정하지 않으면 이런 방을
   * 수정할 때 클라이언트가 undefined를 보내 @IsBoolean() 검증에서 400이 발생한다.
   */
  async getRoomRecord(roomId: string): Promise<RoomRecord | undefined> {
    const room = await this.cacheService.get<RoomRecord>(this.roomKey(roomId));
    if (!room) {
      return undefined;
    }
    return {
      ...room,
      isUnlisted: room.isUnlisted ?? false,
      isPrivate: room.isPrivate ?? false,
      pwdHash: room.pwdHash ?? null,
      participants: room.participants.map((participant) => ({
        ...participant,
        isAccount: participant.isAccount ?? false,
      })),
    };
  }

  /**
   * room:index 정리(reconciliation) 전용 존재 확인. getRoomRecord()는 Redis 오류 시
   * 로컬 폴백으로 undefined를 반환할 수 있어(목록 표시용으로는 안전하지만), 그 결과를
   * "방이 진짜 없다"고 오인해 index에서 지우면 일시 오류로 살아있는 방이 영구히
   * 사라진다. getStrict는 폴백 없이 Redis 오류를 그대로 던지므로, 호출자가 "정말 없음"과
   * "지금은 판단 불가"를 구분할 수 있다.
   */
  async roomExistsStrict(roomId: string): Promise<boolean> {
    const room = await this.cacheService.getStrict<RoomRecord>(
      this.roomKey(roomId),
    );
    return room !== undefined;
  }

  async getRoomOrThrow(roomId: string): Promise<RoomRecord> {
    const room = await this.getRoomRecord(roomId);
    if (!room) {
      throw new NotFoundException(`방을 찾을 수 없습니다. (roomId: ${roomId})`);
    }
    return room;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  toPublicRoom({ pwdHash, ...publicRoom }: RoomRecord): RoomItemDto {
    return publicRoom;
  }

  /**
   * room 상태는 여러 인스턴스가 공유하는 핵심 데이터라 cacheService.set()의 "Redis
   * 실패 시 로컬로 조용히 폴백" 동작을 쓰면 안 된다 — 폴백하면 이 인스턴스에서는
   * 성공한 것처럼 보이지만 실제 공유 Redis에는 반영되지 않아, 이미 Redis에 반영된
   * 타이머 예약(RoomTimerService) 등과 어긋나는 조용한 정합성 문제로 이어진다.
   * setStrict는 실패를 그대로 던지므로 호출자(withRoomLock 내부)가 상태 저장
   * 실패를 알아채고 이후 정리(cleanupStaleRoundTimers 등)를 건너뛸 수 있다.
   */
  async saveRoom(room: RoomItemDto): Promise<void> {
    await this.writeSharedState(
      this.roomKey(room.roomId),
      room,
      ROOM_TTL_SECONDS,
      roomLockKey(room.roomId),
    );
  }

  /**
   * 여러 인스턴스가 공유하는 room 상태 쓰기의 단일 통로. 모든 상태 쓰기가 여기를
   * 지나므로, 락 lease 검사와 fencing 검사를 이 한 곳에만 걸면 된다.
   *
   * 1. assertLeaseHeld: Redis 장애가 락 TTL보다 길어져 lease가 만료됐다면 여기서
   *    막는다. AbortSignal은 이미 진행 중인 await를 되돌리지 못하므로, 실제 쓰기
   *    직전에 다시 확인하는 이 경계가 마지막 방어선이다.
   * 2. fencing: 우리 인스턴스가 lease 만료를 아직 감지하지 못한 상태에서 뒤늦게
   *    쓰기를 시도해도, 이미 더 새로운 token이 발급됐다면 Redis가 원자적으로 거부한다.
   *
   * lockKey에는 "이 key를 보호하는 락"을 넘긴다. 중첩 락에서 ambient lease가 가장
   * 안쪽 락의 것이 되므로, 이 값이 있어야 엉뚱한 fencing 카운터를 검사하는 일을
   * RoomLockService가 잡아낼 수 있다.
   */
  private async writeSharedState<T>(
    key: string,
    value: T,
    ttlSeconds: number,
    lockKey: string,
  ): Promise<void> {
    this.roomLockService.assertLeaseHeld();

    const accepted = await this.cacheService.setStrictFenced(
      key,
      value,
      ttlSeconds,
      this.roomLockService.getFenceGuard(lockKey),
    );
    this.assertFencedOperationAccepted(accepted, key, '상태 쓰기');
  }

  /**
   * writeSharedState의 삭제판. 삭제도 상태를 바꾸는 쓰기이므로 같은 방어를 받는다 —
   * 이게 없으면 lease를 잃은 워커가 뒤늦게 정리(deleteRoom, 게임 종료 시 라운드 데이터
   * 정리)에 들어가, 그 사이 새 락을 잡은 워커가 기록한 상태를 지워버릴 수 있다.
   */
  private async deleteSharedState(key: string, lockKey: string): Promise<void> {
    this.roomLockService.assertLeaseHeld();

    const accepted = await this.cacheService.delStrictFenced(
      key,
      this.roomLockService.getFenceGuard(lockKey),
    );
    this.assertFencedOperationAccepted(accepted, key, '상태 삭제');
  }

  private assertFencedOperationAccepted(
    accepted: boolean,
    key: string,
    operation: string,
  ): void {
    if (accepted) {
      return;
    }
    this.logger.error(
      `더 새로운 fencing token이 이미 발급되어 ${operation}를 거부했습니다(${key}).`,
      {
        event: 'stale_fencing_write_rejected',
        errorCode: 'STALE_FENCING_WRITE',
      },
    );
    throw new StaleFencingWriteError(key);
  }

  async deleteRoomRecord(roomId: string): Promise<void> {
    await this.deleteSharedState(this.roomKey(roomId), roomLockKey(roomId));
  }

  private roomKey(roomId: string): string {
    return `${ROOM_CACHE_KEY_PREFIX}${roomId}`;
  }

  /**
   * songOrder/roundsSnapshot/currentAnswers/currentReveal는 room 상태와 마찬가지로
   * 여러 인스턴스가 공유해야 하는 라운드 진행 데이터라 get/set이 아니라
   * getStrict/setStrict를 쓴다. 일반 get/set의 로컬 폴백을 허용하면, room 상태
   * (setStrict로 이미 보호됨)는 Redis에 반영됐는데 이 데이터만 이 인스턴스의 로컬
   * 캐시에만 남는 상황이 생길 수 있다 — 다른 인스턴스가 곡 순서를 빈 배열로 읽어
   * 게임을 조기 종료하거나, 정답을 인식하지 못하는 등 감지하기 어려운 정합성
   * 문제로 이어진다.
   */
  async getSongOrder(roomId: string): Promise<string[]> {
    return (
      (await this.cacheService.getStrict<string[]>(
        this.songOrderKey(roomId),
      )) ?? []
    );
  }

  async setSongOrder(roomId: string, songOrder: string[]): Promise<void> {
    await this.writeSharedState(
      this.songOrderKey(roomId),
      songOrder,
      ROOM_TTL_SECONDS,
      roomLockKey(roomId),
    );
  }

  async deleteSongOrder(roomId: string): Promise<void> {
    await this.deleteSharedState(
      this.songOrderKey(roomId),
      roomLockKey(roomId),
    );
  }

  private songOrderKey(roomId: string): string {
    return `${SONG_ORDER_CACHE_KEY_PREFIX}${roomId}`;
  }

  async getRoundsSnapshot(
    roomId: string,
  ): Promise<Record<string, QuizRoundData>> {
    return (
      (await this.cacheService.getStrict<Record<string, QuizRoundData>>(
        this.roundsSnapshotKey(roomId),
      )) ?? {}
    );
  }

  async setRoundsSnapshot(
    roomId: string,
    snapshot: Record<string, QuizRoundData>,
  ): Promise<void> {
    await this.writeSharedState(
      this.roundsSnapshotKey(roomId),
      snapshot,
      ROOM_TTL_SECONDS,
      roomLockKey(roomId),
    );
  }

  async deleteRoundsSnapshot(roomId: string): Promise<void> {
    await this.deleteSharedState(
      this.roundsSnapshotKey(roomId),
      roomLockKey(roomId),
    );
  }

  private roundsSnapshotKey(roomId: string): string {
    return `${ROUNDS_SNAPSHOT_CACHE_KEY_PREFIX}${roomId}`;
  }

  async getCurrentAnswers(roomId: string): Promise<string[]> {
    return (
      (await this.cacheService.getStrict<string[]>(
        this.currentAnswersKey(roomId),
      )) ?? []
    );
  }

  async setCurrentAnswers(roomId: string, answers: string[]): Promise<void> {
    await this.writeSharedState(
      this.currentAnswersKey(roomId),
      answers,
      ROOM_TTL_SECONDS,
      roomLockKey(roomId),
    );
  }

  async deleteCurrentAnswers(roomId: string): Promise<void> {
    await this.deleteSharedState(
      this.currentAnswersKey(roomId),
      roomLockKey(roomId),
    );
  }

  private currentAnswersKey(roomId: string): string {
    return `${CURRENT_ANSWERS_CACHE_KEY_PREFIX}${roomId}`;
  }

  async getCurrentReveal(
    roomId: string,
  ): Promise<
    | { quizSongId: string; songNm: string; atstNm: string; albmNm: string }
    | undefined
  > {
    return this.cacheService.getStrict(this.currentRevealKey(roomId));
  }

  async setCurrentReveal(
    roomId: string,
    reveal: {
      quizSongId: string;
      songNm: string;
      atstNm: string;
      albmNm: string;
    },
  ): Promise<void> {
    await this.writeSharedState(
      this.currentRevealKey(roomId),
      reveal,
      ROOM_TTL_SECONDS,
      roomLockKey(roomId),
    );
  }

  async deleteCurrentReveal(roomId: string): Promise<void> {
    await this.deleteSharedState(
      this.currentRevealKey(roomId),
      roomLockKey(roomId),
    );
  }

  private currentRevealKey(roomId: string): string {
    return `${CURRENT_REVEAL_CACHE_KEY_PREFIX}${roomId}`;
  }

  private passwordAttemptKey(
    roomId: string,
    clientIp: string | undefined,
  ): string {
    return `${PASSWORD_ATTEMPT_CACHE_KEY_PREFIX}${roomId}:${clientIp ?? 'unknown'}`;
  }

  /** 이 방+IP 조합의 최근 실패 횟수가 한도를 넘었으면 429를 던진다(비밀번호 확인 전에 먼저 확인). */
  async assertPasswordAttemptAllowed(
    roomId: string,
    clientIp: string | undefined,
  ): Promise<void> {
    const key = this.passwordAttemptKey(roomId, clientIp);
    const attempts = (await this.cacheService.get<number>(key)) ?? 0;
    if (attempts >= PASSWORD_ATTEMPT_LIMIT) {
      throw new HttpException(
        '비밀번호 시도 횟수를 초과했습니다. 잠시 후 다시 시도해주세요.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /** 비밀번호가 틀렸을 때만 호출한다. 성공한 시도나 공개방 입장은 집계하지 않는다. */
  async recordFailedPasswordAttempt(
    roomId: string,
    clientIp: string | undefined,
  ): Promise<void> {
    const key = this.passwordAttemptKey(roomId, clientIp);
    const attempts = ((await this.cacheService.get<number>(key)) ?? 0) + 1;
    await this.cacheService.set(key, attempts, PASSWORD_ATTEMPT_WINDOW_SECONDS);
  }

  async clearPasswordAttempts(
    roomId: string,
    clientIp: string | undefined,
  ): Promise<void> {
    await this.cacheService.del(this.passwordAttemptKey(roomId, clientIp));
  }

  /**
   * 방 목록 조회(getRooms)용. 목록 표시가 잠깐 비거나 오래된 것은 게임 진행 정합성에
   * 영향이 없으므로 여기서는 로컬 폴백을 허용하는 get을 그대로 쓴다. 인덱스를 고치는
   * read-modify-write는 아래 getRoomIndexStrict를 쓴다.
   */
  async getRoomIndex(): Promise<string[]> {
    return (await this.cacheService.get<string[]>(ROOM_INDEX_CACHE_KEY)) ?? [];
  }

  /**
   * addToIndex/removeFromIndex 전용 읽기. 일반 get의 로컬 폴백을 쓰면 Redis 장애 중에
   * "이 인스턴스의 로컬 캐시에만 있는 인덱스"를 읽어 수정한 뒤 그대로 써버리게 되는데,
   * 그건 락으로 직렬화한 의미를 지운다. 읽기 자체를 실패시켜 fail-closed 한다.
   */
  private async getRoomIndexStrict(): Promise<string[]> {
    return (
      (await this.cacheService.getStrict<string[]>(ROOM_INDEX_CACHE_KEY)) ?? []
    );
  }

  /**
   * room:index는 여러 인스턴스가 동시에 건드릴 수 있는 read-modify-write라, roomId별
   * 락(RoomService.withRoomLock)과 별개로 인덱스 전용 락으로 직렬화해야 두 인스턴스가
   * 동시에 방을 만들거나 지워도 마지막 쓰기가 상대방의 변경을 덮어쓰지 않는다.
   * 락으로 보호하는 correctness-critical 경로이므로 읽기/쓰기 모두 strict path를 쓴다.
   */
  async addToIndex(roomId: string): Promise<void> {
    await this.roomLockService.withLock(ROOM_INDEX_LOCK_KEY, async () => {
      const index = await this.getRoomIndexStrict();
      if (index.includes(roomId)) {
        return;
      }
      index.push(roomId);
      // 이 안에서는 ambient lease가 room 락이 아니라 room-index 락의 것이다.
      await this.writeSharedState(
        ROOM_INDEX_CACHE_KEY,
        index,
        ROOM_INDEX_TTL_SECONDS,
        ROOM_INDEX_LOCK_KEY,
      );
    });
  }

  async removeFromIndex(roomId: string): Promise<void> {
    await this.roomLockService.withLock(ROOM_INDEX_LOCK_KEY, async () => {
      const index = await this.getRoomIndexStrict();
      if (!index.includes(roomId)) {
        return;
      }
      await this.writeSharedState(
        ROOM_INDEX_CACHE_KEY,
        index.filter((id) => id !== roomId),
        ROOM_INDEX_TTL_SECONDS,
        ROOM_INDEX_LOCK_KEY,
      );
    });
  }

  private roomCreationKey(clientIp: string | undefined): string {
    return `${ROOM_CREATION_CACHE_KEY_PREFIX}${clientIp ?? 'unknown'}`;
  }

  /**
   * IP당 방 생성 속도를 제한한다. bcrypt.hash나 Redis 쓰기를 하기 전, 요청 처리
   * 맨 앞에서 불러야 한도 초과 요청의 비용을 최소화할 수 있다.
   */
  async assertRoomCreationAllowed(clientIp: string | undefined): Promise<void> {
    const key = this.roomCreationKey(clientIp);
    const attempts = await this.incrementRoomCreationCounter(key);
    if (attempts > ROOM_CREATION_LIMIT) {
      throw new HttpException(
        '방 생성 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * GET → +1 → SET으로 나누면 동시 요청이 모두 같은 이전 값을 읽고 통과할 수 있어
   * (appendChatHistory와 같은 이유로 Redis eval을 쓴다). INCR+최초 EXPIRE를 하나의
   * Lua 실행으로 묶어 원자적으로 처리하고, Redis가 없거나 순간 응답하지 못하면
   * 로컬 카운터로 폴백한다.
   */
  private async incrementRoomCreationCounter(key: string): Promise<number> {
    const redis = this.cacheService.getRedisClient();
    if (redis && this.cacheService.isRedisReady()) {
      try {
        const count = await redis.eval(
          INCR_WITH_EXPIRE_SCRIPT,
          1,
          key,
          ROOM_CREATION_WINDOW_SECONDS,
        );
        return Number(count);
      } catch (err) {
        this.logger.warn(
          `방 생성 rate limit 카운터 Redis 갱신 실패, 로컬 카운터로 폴백합니다: ${(err as Error).message}`,
        );
      }
    }
    return this.incrementLocalRoomCreationCounter(key);
  }

  private incrementLocalRoomCreationCounter(key: string): number {
    const now = Date.now();
    const entry = this.localRoomCreationCounts.get(key);
    if (!entry || entry.resetAt <= now) {
      this.localRoomCreationCounts.set(key, {
        count: 1,
        resetAt: now + ROOM_CREATION_WINDOW_SECONDS * 1000,
      });
      return 1;
    }
    entry.count += 1;
    return entry.count;
  }
}
