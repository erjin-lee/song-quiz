import { randomUUID } from 'crypto';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CacheService } from '../cache/cache.service';
import { delay } from '../common/delay';

/** 락을 쥐고 있는 동안 자동 만료되기까지의 시간. 임계구역(DB 쿼리 몇 개 + 캐시 get/set)은
 * 보통 수십~수백ms 안에 끝나므로 이 값은 그보다 훨씬 넉넉한 안전망이다. */
const LOCK_TTL_MS = 8_000;
/** TTL의 절반 주기로 하트비트를 보내 락을 연장한다. 드물게 임계구역이 오래 걸려도
 * 조기 만료로 다른 인스턴스가 락을 가로채는 것을 막는다. */
const LOCK_HEARTBEAT_MS = LOCK_TTL_MS / 2;
/** 락 획득 자체를 기다리는 전체 예산. RoomTimerService의 RESERVATION_MS가 이 값에서
 * 파생되므로(§RoomTimerService), 이 값을 바꾸면 타이머 예약 시간도 함께 늘어난다. */
export const LOCK_ACQUIRE_TIMEOUT_MS = 12_000;
const LOCK_RETRY_BASE_MS = 30;
const LOCK_RETRY_JITTER_MS = 30;

const RELEASE_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
else
  return 0
end
`;

const EXTEND_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("PEXPIRE", KEYS[1], ARGV[2])
else
  return 0
end
`;

/**
 * roomId 등 임의의 key에 대한 작업을 인스턴스 간에도 직렬화하는 분산 락.
 * REDIS_HOST가 설정돼 있으면 Redis 기반 분산 락을, 아니면(로컬 개발 등) 기존
 * RoomService.roomLocks와 동일한 in-memory Promise 체이닝으로 동작한다.
 * 두 모드는 프로세스 시작 시 1회만 결정하고 이후 바꾸지 않는다 — 매 호출마다
 * Redis 연결 상태로 모드를 흔들면 스케줄/취소가 어긋나는 문제가 RoomTimerService와
 * 동일하게 발생할 수 있기 때문이다.
 */
@Injectable()
export class RoomLockService implements OnModuleDestroy {
  private readonly logger = new Logger(RoomLockService.name);
  private readonly redisConfigured: boolean;
  /** 로컬 폴백 모드 전용: key -> 대기 중인 작업 체인. */
  private readonly localChains = new Map<string, Promise<unknown>>();

  constructor(private readonly cacheService: CacheService) {
    this.redisConfigured = this.cacheService.getRedisClient() !== null;
  }

  onModuleDestroy(): void {
    this.localChains.clear();
  }

  async withLock<T>(key: string, task: () => Promise<T>): Promise<T> {
    if (this.redisConfigured) {
      return this.withRedisLock(key, task);
    }
    return this.withLocalLock(key, task);
  }

  private async withRedisLock<T>(
    key: string,
    task: () => Promise<T>,
  ): Promise<T> {
    const redis = this.cacheService.getRedisClient();
    if (!redis) {
      // redisConfigured는 부팅 시점 값이라 이론상 여기 도달할 일은 없지만,
      // 타입 안전을 위해 방어적으로 처리한다.
      throw new ServiceUnavailableException(
        'Redis 클라이언트를 사용할 수 없습니다.',
      );
    }

    const lockKey = `lock:${key}`;
    const token = randomUUID();
    const deadline = Date.now() + LOCK_ACQUIRE_TIMEOUT_MS;

    let acquired = false;
    while (Date.now() < deadline) {
      if (!this.cacheService.isRedisReady()) {
        break;
      }
      try {
        const result = await redis.set(lockKey, token, 'PX', LOCK_TTL_MS, 'NX');
        if (result === 'OK') {
          acquired = true;
          break;
        }
      } catch (err) {
        this.logger.warn(
          `분산 락 획득 시도 중 Redis 오류(${lockKey}): ${(err as Error).message}`,
        );
      }
      await delay(LOCK_RETRY_BASE_MS + Math.random() * LOCK_RETRY_JITTER_MS);
    }

    if (!acquired) {
      throw new ServiceUnavailableException(
        `분산 락 획득에 실패했습니다(key: ${key}). 잠시 후 다시 시도해주세요.`,
      );
    }

    const heartbeat = setInterval(() => {
      redis.eval(EXTEND_SCRIPT, 1, lockKey, token, LOCK_TTL_MS).catch((err) => {
        this.logger.warn(
          `분산 락 연장 실패(${lockKey}): ${(err as Error).message}`,
        );
      });
    }, LOCK_HEARTBEAT_MS);
    heartbeat.unref();

    try {
      return await task();
    } finally {
      clearInterval(heartbeat);
      try {
        const released = await redis.eval(RELEASE_SCRIPT, 1, lockKey, token);
        if (released !== 1) {
          this.logger.error(
            `분산 락 해제 시 토큰 불일치(${lockKey}): 이미 TTL 만료 후 다른 인스턴스가 점유했을 수 있습니다.`,
          );
        }
      } catch (err) {
        this.logger.warn(
          `분산 락 해제 실패(${lockKey}): ${(err as Error).message}`,
        );
      }
    }
  }

  /** 기존 RoomService.withRoomLock과 동일한 Promise 체이닝 방식(단일 프로세스 내 직렬화). */
  private async withLocalLock<T>(
    key: string,
    task: () => Promise<T>,
  ): Promise<T> {
    const previous = this.localChains.get(key) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(() => task());
    this.localChains.set(
      key,
      run.catch(() => undefined),
    );
    return run;
  }
}
