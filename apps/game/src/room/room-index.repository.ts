import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CacheService } from '../cache/cache.service';
import { delay } from '../common/delay';
import { RoomFencedStateStore } from './room-fenced-state.store';
import { RoomLockService } from './room-lock.service';

const ROOM_INDEX_CACHE_KEY = 'room:index';
/** room:index read-modify-write를 인스턴스 간에 직렬화하기 위한 락 키. */
const ROOM_INDEX_LOCK_KEY = 'room-index';
/**
 * room 본체는 활동마다 TTL이 갱신되는 sliding TTL이지만, room:index는 room 하나하나의
 * 활동을 알 방법이 없다. 예전처럼 index에도 room TTL을 걸면, 방 생성/삭제 없이
 * 활동만 오래 이어질 때 index가 먼저 만료되어 살아있는 방이 전부 목록에서 사라지는
 * 문제가 생긴다. 그래서 index는 만료시키지 않고(0 = 영구), addToIndex/removeFromIndex로
 * 항목 단위로만 정합성을 맞춘다. 방이 TTL로 자연 만료돼 removeFromIndex 경로를 타지
 * 못한 stale entry는 RoomIndexReconciler가 조회 시점에 걸러내며 정리한다.
 */
const ROOM_INDEX_TTL_SECONDS = 0;

/** room:index PERSIST 마이그레이션 재시도 한도(부팅 직후 Redis가 아직 준비되지 않았을 수 있어서). */
const INDEX_TTL_MIGRATION_MAX_ATTEMPTS = 5;
const INDEX_TTL_MIGRATION_RETRY_MS = 1_000;

/**
 * room:index(공개 방 목록 조회용 roomId 집합)의 get/add/remove와, 배포 전 코드가
 * 남긴 TTL을 제거하는 1회성 마이그레이션만 담당한다. room 레코드 자체(RoomRepository)
 * 나 stale entry 정리 판단(RoomIndexReconciler)과는 독립적인 관심사라 별도 클래스로
 * 둔다.
 */
@Injectable()
export class RoomIndexRepository implements OnModuleInit {
  private readonly logger = new Logger(RoomIndexRepository.name);

  constructor(
    private readonly cacheService: CacheService,
    private readonly roomLockService: RoomLockService,
    private readonly stateStore: RoomFencedStateStore,
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
      await this.stateStore.writeSharedState(
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
      await this.stateStore.writeSharedState(
        ROOM_INDEX_CACHE_KEY,
        index.filter((id) => id !== roomId),
        ROOM_INDEX_TTL_SECONDS,
        ROOM_INDEX_LOCK_KEY,
      );
    });
  }
}
