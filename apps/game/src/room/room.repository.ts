import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CacheService } from '../cache/cache.service';
import { QuizRoundData } from './clients/quiz.client';
import { RoomItemDto } from './dto/room-item.dto';
import { RoomLockService } from './room-lock.service';

/**
 * 비밀방 비밀번호 대입 시도 제한. 공개방 입장이나 성공한 입장까지 함께 제한되지
 * 않도록, "실패한 비밀번호 시도"만 방(roomId) + 요청 IP 기준으로 집계한다.
 */
const PASSWORD_ATTEMPT_LIMIT = 5;
const PASSWORD_ATTEMPT_WINDOW_SECONDS = 60;

const ROOM_INDEX_CACHE_KEY = 'room:index';
/** room:index read-modify-write를 인스턴스 간에 직렬화하기 위한 락 키. */
const ROOM_INDEX_LOCK_KEY = 'room-index';
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
export class RoomRepository {
  private readonly logger = new Logger(RoomRepository.name);

  /**
   * roomId -> 최근 채팅/시스템 메시지 히스토리(재접속 시 복원용, 최대 CHAT_HISTORY_MAX_ENTRIES개).
   * Redis가 설정돼 있으면 Redis LIST(room:chat:<roomId>)를 우선 사용하고, 이 Map은
   * append/조회 시점에 Redis 커맨드가 실패할 때만 쓰는 로컬 폴백 저장소로 남겨둔다.
   */
  private readonly chatHistory = new Map<string, ChatHistoryEntry[]>();

  constructor(
    private readonly cacheService: CacheService,
    private readonly roomLockService: RoomLockService,
  ) {}

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
    await this.cacheService.setStrict(
      this.roomKey(room.roomId),
      room,
      ROOM_TTL_SECONDS,
    );
  }

  async deleteRoomRecord(roomId: string): Promise<void> {
    await this.cacheService.del(this.roomKey(roomId));
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
    await this.cacheService.setStrict(
      this.songOrderKey(roomId),
      songOrder,
      ROOM_TTL_SECONDS,
    );
  }

  async deleteSongOrder(roomId: string): Promise<void> {
    await this.cacheService.del(this.songOrderKey(roomId));
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
    await this.cacheService.setStrict(
      this.roundsSnapshotKey(roomId),
      snapshot,
      ROOM_TTL_SECONDS,
    );
  }

  async deleteRoundsSnapshot(roomId: string): Promise<void> {
    await this.cacheService.del(this.roundsSnapshotKey(roomId));
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
    await this.cacheService.setStrict(
      this.currentAnswersKey(roomId),
      answers,
      ROOM_TTL_SECONDS,
    );
  }

  async deleteCurrentAnswers(roomId: string): Promise<void> {
    await this.cacheService.del(this.currentAnswersKey(roomId));
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
    await this.cacheService.setStrict(
      this.currentRevealKey(roomId),
      reveal,
      ROOM_TTL_SECONDS,
    );
  }

  async deleteCurrentReveal(roomId: string): Promise<void> {
    await this.cacheService.del(this.currentRevealKey(roomId));
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

  async getRoomIndex(): Promise<string[]> {
    return (await this.cacheService.get<string[]>(ROOM_INDEX_CACHE_KEY)) ?? [];
  }

  /**
   * room:index는 여러 인스턴스가 동시에 건드릴 수 있는 read-modify-write라, roomId별
   * 락(RoomService.withRoomLock)과 별개로 인덱스 전용 락으로 직렬화해야 두 인스턴스가
   * 동시에 방을 만들거나 지워도 마지막 쓰기가 상대방의 변경을 덮어쓰지 않는다.
   */
  async addToIndex(roomId: string): Promise<void> {
    await this.roomLockService.withLock(ROOM_INDEX_LOCK_KEY, async () => {
      const index = await this.getRoomIndex();
      index.push(roomId);
      await this.cacheService.set(
        ROOM_INDEX_CACHE_KEY,
        index,
        ROOM_TTL_SECONDS,
      );
    });
  }

  async removeFromIndex(roomId: string): Promise<void> {
    await this.roomLockService.withLock(ROOM_INDEX_LOCK_KEY, async () => {
      const index = await this.getRoomIndex();
      await this.cacheService.set(
        ROOM_INDEX_CACHE_KEY,
        index.filter((id) => id !== roomId),
        ROOM_TTL_SECONDS,
      );
    });
  }
}
