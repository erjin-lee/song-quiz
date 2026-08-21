import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { CacheService } from '../cache/cache.service';
import { LOCK_ACQUIRE_TIMEOUT_MS } from './room-lock.service';

export type RoomTimerKind =
  'round-timeout' | 'speed-reveal' | 'speed-next' | 'disconnect-grace';

const TIMERS_KEY = 'room:timers';
const POLL_INTERVAL_MS = 300;
const POLL_BATCH_SIZE = 50;
/** 한 틱에서 밀린 항목을 몰아 처리하기 위한 반복 횟수 상한(무한 루프 방지). */
const MAX_DRAIN_ITERATIONS = 10;
/**
 * claim된 항목이 실제로 처리되는 동안(핸들러가 withRoomLock으로 최대
 * LOCK_ACQUIRE_TIMEOUT_MS까지 락을 기다릴 수 있다) 다른 인스턴스가 "크래시했다"고
 * 오판해 중복 처리하지 않도록, 그보다 훨씬 넉넉하게 미뤄둔다. 처리 중 실제로
 * 인스턴스가 죽으면 이 시간이 지난 뒤 다른 인스턴스가 자동으로 재수거한다.
 */
const RESERVATION_MS = LOCK_ACQUIRE_TIMEOUT_MS * 2;

/** score가 읽었던 값 그대로일 때만 미래로 미뤄서(claim) 다른 인스턴스의 중복 실행을 막는다. */
const CLAIM_SCRIPT = `
local current = redis.call('ZSCORE', KEYS[1], ARGV[1])
if current == ARGV[2] then
  redis.call('ZADD', KEYS[1], ARGV[3], ARGV[1])
  return 1
else
  return 0
end
`;

/**
 * score가 claim 당시 설정한 예약 시각 그대로일 때만 지운다. 핸들러 실행 중 같은
 * kind+key가 재예약(ZADD)되면 score가 바뀌므로, 그 경우엔 지우지 않고 새 예약을
 * 보존한다.
 */
const DELETE_IF_RESERVED_SCRIPT = `
local current = redis.call('ZSCORE', KEYS[1], ARGV[1])
if current == ARGV[2] then
  redis.call('ZREM', KEYS[1], ARGV[1])
  return 1
else
  return 0
end
`;

/**
 * 라운드 타임아웃/스피드모드/재접속 유예 등 "지연 실행"을 인스턴스 간에 공유한다.
 * REDIS_HOST가 설정돼 있으면 Redis ZSET 기반 폴링/claim으로, 아니면 기존
 * RoomService/RoomGateway의 setTimeout+Map 방식으로 동일하게 동작한다(로컬 개발,
 * 테스트의 jest.useFakeTimers 호환성 유지). 모드는 RoomLockService와 마찬가지로
 * 프로세스 시작 시 1회만 결정한다.
 */
@Injectable()
export class RoomTimerService implements OnModuleDestroy {
  private readonly logger = new Logger(RoomTimerService.name);
  private readonly redisConfigured: boolean;
  private readonly handlers = new Map<
    RoomTimerKind,
    (key: string) => void | Promise<void>
  >();
  /** 로컬 폴백 모드 전용: `${kind}|${key}` -> 예약된 setTimeout. */
  private readonly localTimers = new Map<string, NodeJS.Timeout>();
  private readonly pollInterval: NodeJS.Timeout | undefined;

  constructor(private readonly cacheService: CacheService) {
    this.redisConfigured = this.cacheService.getRedisClient() !== null;
    if (this.redisConfigured) {
      this.pollInterval = setInterval(() => {
        this.poll().catch((err) => {
          this.logger.error(`타이머 폴링 실패: ${(err as Error).message}`);
        });
      }, POLL_INTERVAL_MS);
      this.pollInterval.unref();
    }
  }

  onModuleDestroy(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
    for (const timer of this.localTimers.values()) {
      clearTimeout(timer);
    }
    this.localTimers.clear();
  }

  /** RoomService/RoomGateway가 생성자에서 kind별로 발화 콜백을 등록한다. */
  registerHandler(
    kind: RoomTimerKind,
    handler: (key: string) => void | Promise<void>,
  ): void {
    this.handlers.set(kind, handler);
  }

  schedule(kind: RoomTimerKind, key: string, delaySeconds: number): void {
    if (this.redisConfigured) {
      this.scheduleRedis(kind, key, delaySeconds);
    } else {
      this.scheduleLocal(kind, key, delaySeconds);
    }
  }

  /** 실제로 취소된 예약이 있었으면 true(재접속 판정 등에 사용). */
  async cancel(kind: RoomTimerKind, key: string): Promise<boolean> {
    if (this.redisConfigured) {
      return this.cancelRedis(kind, key);
    }
    return this.cancelLocal(kind, key);
  }

  private member(kind: RoomTimerKind, key: string): string {
    return `${kind}|${key}`;
  }

  private scheduleRedis(
    kind: RoomTimerKind,
    key: string,
    delaySeconds: number,
  ): void {
    const redis = this.cacheService.getRedisClient();
    if (!redis) {
      return;
    }
    const member = this.member(kind, key);
    const fireAt = Date.now() + delaySeconds * 1000;
    // 같은 member면 ZADD가 score만 덮어써 재예약이 곧 취소+재설정 효과를 낸다.
    redis.zadd(TIMERS_KEY, fireAt, member).catch((err) => {
      this.logger.error(
        `타이머 예약 실패(${member}): ${(err as Error).message}`,
      );
    });
  }

  private async cancelRedis(
    kind: RoomTimerKind,
    key: string,
  ): Promise<boolean> {
    const redis = this.cacheService.getRedisClient();
    if (!redis) {
      return false;
    }
    const member = this.member(kind, key);
    try {
      const removed = await redis.zrem(TIMERS_KEY, member);
      return removed === 1;
    } catch (err) {
      this.logger.warn(
        `타이머 취소 실패(${member}): ${(err as Error).message}`,
      );
      return false;
    }
  }

  private scheduleLocal(
    kind: RoomTimerKind,
    key: string,
    delaySeconds: number,
  ): void {
    const member = this.member(kind, key);
    this.clearLocalTimer(member);
    const timer = setTimeout(() => {
      this.localTimers.delete(member);
      this.dispatchLocal(kind, key);
    }, delaySeconds * 1000);
    timer.unref();
    this.localTimers.set(member, timer);
  }

  private cancelLocal(kind: RoomTimerKind, key: string): boolean {
    return this.clearLocalTimer(this.member(kind, key));
  }

  private clearLocalTimer(member: string): boolean {
    const timer = this.localTimers.get(member);
    if (!timer) {
      return false;
    }
    clearTimeout(timer);
    this.localTimers.delete(member);
    return true;
  }

  private dispatchLocal(kind: RoomTimerKind, key: string): void {
    const handler = this.handlers.get(kind);
    if (!handler) {
      this.logger.warn(`등록되지 않은 타이머 kind: ${kind}`);
      return;
    }
    Promise.resolve(handler(key)).catch((err) => {
      this.logger.error(
        `타이머 핸들러 실행 실패(${kind}:${key}): ${(err as Error).message}`,
      );
    });
  }

  /** Redis 모드: 만료된 항목을 배치로 훑어 claim되는 것만 처리한다. */
  private async poll(): Promise<void> {
    if (!this.cacheService.isRedisReady()) {
      return;
    }
    const redis = this.cacheService.getRedisClient();
    if (!redis) {
      return;
    }

    for (let i = 0; i < MAX_DRAIN_ITERATIONS; i++) {
      const now = Date.now();
      const raw = await redis.zrangebyscore(
        TIMERS_KEY,
        '-inf',
        now,
        'WITHSCORES',
        'LIMIT',
        0,
        POLL_BATCH_SIZE,
      );
      if (raw.length === 0) {
        return;
      }

      for (let j = 0; j < raw.length; j += 2) {
        const member = raw[j];
        const score = raw[j + 1];
        const reservedAt = now + RESERVATION_MS;
        const claimed = await this.tryClaim(redis, member, score, reservedAt);
        if (claimed) {
          this.fireClaimed(redis, member, reservedAt);
        }
      }

      if (raw.length < POLL_BATCH_SIZE * 2) {
        return;
      }
    }
  }

  private async tryClaim(
    redis: Redis,
    member: string,
    score: string,
    reservedAt: number,
  ): Promise<boolean> {
    try {
      const result = await redis.eval(
        CLAIM_SCRIPT,
        1,
        TIMERS_KEY,
        member,
        score,
        reservedAt,
      );
      return result === 1;
    } catch (err) {
      this.logger.error(
        `타이머 claim 실패(${member}): ${(err as Error).message}`,
      );
      return false;
    }
  }

  /**
   * claim에 성공한 항목의 핸들러를 실행한다. 다른 항목의 claim을 막지 않도록 await하지 않는다.
   * 핸들러가 성공했을 때만, 그리고 그 사이 재예약되지 않았을 때만(score가 claim 당시
   * 예약 시각 그대로일 때만) 지운다. 핸들러가 실패하면 지우지 않고 그대로 둔다 —
   * score는 이미 미래(reservedAt)로 미뤄져 있으므로, 그 시각이 지나면 poll이 다시
   * 집어 들어 자동으로 재시도된다(크래시 복구와 동일한 경로).
   */
  private fireClaimed(redis: Redis, member: string, reservedAt: number): void {
    const separatorIndex = member.indexOf('|');
    const kind = member.slice(0, separatorIndex) as RoomTimerKind;
    const key = member.slice(separatorIndex + 1);
    const handler = this.handlers.get(kind);

    if (!handler) {
      this.logger.warn(`등록되지 않은 타이머 kind: ${kind}`);
      this.deleteIfReserved(redis, member, reservedAt);
      return;
    }

    Promise.resolve()
      .then(() => handler(key))
      .then(() => {
        this.deleteIfReserved(redis, member, reservedAt);
      })
      .catch((err) => {
        this.logger.error(
          `타이머 핸들러 실행 실패(${kind}:${key}), 예약을 유지해 재시도합니다: ${(err as Error).message}`,
        );
      });
  }

  private deleteIfReserved(
    redis: Redis,
    member: string,
    reservedAt: number,
  ): void {
    redis
      .eval(DELETE_IF_RESERVED_SCRIPT, 1, TIMERS_KEY, member, reservedAt)
      .catch((err) => {
        this.logger.warn(
          `타이머 정리(zrem) 실패(${member}): ${(err as Error).message}`,
        );
      });
  }
}
