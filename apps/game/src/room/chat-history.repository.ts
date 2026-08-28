import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from '../cache/cache.service';
import { ROOM_TTL_SECONDS } from './room.repository';

const CHAT_HISTORY_CACHE_KEY_PREFIX = 'room:chat:';
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
 * roomId별 채팅/시스템 메시지 히스토리(재접속 시 복원용) 저장소. room 레코드나
 * room:index와 달리 fencing 보호가 필요 없는(스케줄/취소처럼 짝을 이루지 않는
 * 단발성 append) 별도 Redis 자료구조(LIST)를 쓰므로 독립된 클래스로 둔다.
 */
@Injectable()
export class ChatHistoryRepository {
  private readonly logger = new Logger(ChatHistoryRepository.name);

  /**
   * roomId -> 최근 채팅/시스템 메시지 히스토리. Redis가 설정돼 있으면 Redis
   * LIST(room:chat:<roomId>)를 우선 사용하고, 이 Map은 append/조회 시점에 Redis
   * 커맨드가 실패할 때만 쓰는 로컬 폴백 저장소로 남겨둔다.
   */
  private readonly chatHistory = new Map<string, ChatHistoryEntry[]>();

  constructor(private readonly cacheService: CacheService) {}

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
}
