import { randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import { CacheService } from '../cache/cache.service';

/** @nestjs/throttler가 패키지 index에서 재수출하지 않아 형태만 그대로 옮겨왔다. */
interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

/**
 * sliding-window-log 방식으로 요청 시각을 ZSET에 기록해 카운트한다.
 * blockKey에는 만료 시각(ms epoch)을 값으로 저장해 두고 Lua에서 직접 비교한다 —
 * @nestjs/throttler 기본(in-memory) 구현이 차단 해제 시점에 히트 카운트를
 * 0으로 리셋하는 것(resetBlockdRequest)과 동일하게, 차단이 막 풀린 순간이면
 * 슬라이딩 윈도우에 남아있던 이전 히트 기록을 지우고 이번 요청을 1번째로 센다.
 * 이 리셋을 빼면 차단 직전까지 쌓인 히트가 윈도우(ttl) 안에 그대로 남아있어
 * 차단 해제 직후 요청이 다시 즉시 차단되어 버린다.
 * KEYS[1]=히트 기록 ZSET, KEYS[2]=차단 플래그(값=만료 시각 ms)
 * ARGV[1]=now(ms), ARGV[2]=ttl(ms), ARGV[3]=limit, ARGV[4]=blockDuration(ms), ARGV[5]=이번 히트의 고유 id
 */
const INCREMENT_SCRIPT = `
local hitsKey = KEYS[1]
local blockKey = KEYS[2]
local now = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local blockDuration = tonumber(ARGV[4])
local member = ARGV[5]

local blockExpiresAt = tonumber(redis.call("GET", blockKey) or "0")

if blockExpiresAt > now then
  local totalHits = redis.call("ZCARD", hitsKey)
  return { totalHits, math.ceil(ttl / 1000), 1, math.ceil((blockExpiresAt - now) / 1000) }
end

if blockExpiresAt > 0 then
  redis.call("DEL", hitsKey, blockKey)
end

redis.call("ZREMRANGEBYSCORE", hitsKey, 0, now - ttl)
redis.call("ZADD", hitsKey, now, member)
redis.call("PEXPIRE", hitsKey, ttl)

local totalHits = redis.call("ZCARD", hitsKey)
local isBlocked = 0
local timeToBlockExpire = 0

if totalHits > limit then
  -- 값(now + blockDuration)으로 논리적 만료를 직접 판단하므로, 키 자체의 Redis TTL은
  -- blockDuration보다 넉넉히 길게 잡아야 한다. 그렇지 않으면 다음 요청이 오기 전에
  -- Redis가 먼저 키를 지워버려("GET"이 nil), 위의 리셋 분기(blockExpiresAt > 0)가
  -- 발동하지 못하고 슬라이딩 윈도우에 남은 이전 히트가 그대로 다시 카운트되어 즉시
  -- 재차단되는 문제가 생긴다.
  redis.call("SET", blockKey, now + blockDuration, "PX", blockDuration + ttl)
  isBlocked = 1
  timeToBlockExpire = math.ceil(blockDuration / 1000)
end

return { totalHits, math.ceil(ttl / 1000), isBlocked, timeToBlockExpire }
`;

/**
 * @nestjs/throttler는 Redis storage를 기본 제공하지 않아, 기존 CacheService의
 * ioredis 클라이언트를 재사용해 직접 구현한다. REDIS_HOST가 설정돼 있으면 Redis
 * 기반으로 인스턴스 간 rate limit을 공유하고, 아니면(로컬 개발 등) @nestjs/throttler가
 * 기본 제공하는 in-memory 구현으로 폴백한다. 모드는 RoomLockService와 동일하게
 * 부팅 시 1회만 결정한다.
 */
@Injectable()
export class RedisThrottlerStorageService implements ThrottlerStorage {
  private readonly logger = new Logger(RedisThrottlerStorageService.name);
  private readonly redisConfigured: boolean;
  private readonly localFallback = new ThrottlerStorageService();

  constructor(private readonly cacheService: CacheService) {
    this.redisConfigured = this.cacheService.getRedisClient() !== null;
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    if (!this.redisConfigured || !this.cacheService.isRedisReady()) {
      return this.localFallback.increment(
        key,
        ttl,
        limit,
        blockDuration,
        throttlerName,
      );
    }

    const redis = this.cacheService.getRedisClient();
    if (!redis) {
      return this.localFallback.increment(
        key,
        ttl,
        limit,
        blockDuration,
        throttlerName,
      );
    }

    try {
      const [totalHits, timeToExpire, isBlocked, timeToBlockExpire] =
        (await redis.eval(
          INCREMENT_SCRIPT,
          2,
          `throttler:hits:${key}`,
          `throttler:block:${key}`,
          Date.now(),
          ttl,
          limit,
          blockDuration,
          randomUUID(),
        )) as [number, number, number, number];

      return {
        totalHits,
        timeToExpire,
        isBlocked: isBlocked === 1,
        timeToBlockExpire,
      };
    } catch (err) {
      this.logger.warn(
        `Redis rate limit 카운트 실패(${key}), 로컬 메모리로 폴백합니다: ${(err as Error).message}`,
      );
      return this.localFallback.increment(
        key,
        ttl,
        limit,
        blockDuration,
        throttlerName,
      );
    }
  }
}
