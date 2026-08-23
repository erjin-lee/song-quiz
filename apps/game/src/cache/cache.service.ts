import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';

interface LocalCacheEntry {
  value: string;
  expiresAt: number | null;
}

@Injectable()
export class CacheService implements OnApplicationShutdown {
  private readonly logger = new Logger(CacheService.name);
  private readonly defaultTtlSeconds = Number(
    process.env.CACHE_DEFAULT_TTL_SECONDS ?? 300,
  );
  private readonly localCache = new Map<string, LocalCacheEntry>();
  private readonly localCacheSweepTimer: NodeJS.Timeout;
  private readonly redis: Redis | null;
  private redisReady = false;

  constructor() {
    this.redis = this.createRedisClient();

    this.localCacheSweepTimer = setInterval(
      () => this.sweepExpiredLocalEntries(),
      60_000,
    );
    this.localCacheSweepTimer.unref();
  }

  /**
   * OnModuleDestroy가 아니라 OnApplicationShutdown을 쓴다 — Nest의 종료 순서상
   * OnModuleDestroy는 HTTP/소켓 서버가 요청을 다 처리하고 닫히기(dispose) *전에*
   * 실행돼, 이 시점에 redis.quit()하면 그레이스풀 셧다운 중 아직 처리 중이던
   * 요청이 Redis에 접근하다 끊긴 연결 때문에 실패할 수 있다. OnApplicationShutdown은
   * dispose() 이후에 실행되므로 HTTP 서버가 이미 요청을 다 흘려보낸 뒤에 Redis를
   * 끊는다.
   */
  async onApplicationShutdown(): Promise<void> {
    clearInterval(this.localCacheSweepTimer);
    if (this.redis) {
      await this.redis.quit().catch(() => this.redis?.disconnect());
    }
  }

  /**
   * 락/ZSET/LIST 등 get·set·del로 표현할 수 없는 원시 Redis 커맨드가 필요한
   * 서비스(RoomLockService, RoomTimerService 등)를 위해 raw 클라이언트를 노출한다.
   * REDIS_HOST 미설정이면 null이며, 이 값은 프로세스 생애주기 동안 바뀌지 않으므로
   * 호출자는 부팅 시 1회 모드를 결정하는 용도로 써야 한다(연결 성공 여부는 isRedisReady 참고).
   */
  getRedisClient(): Redis | null {
    return this.redis;
  }

  /** 지금 이 순간 Redis에 커맨드를 보낼 수 있는지. 단발성 오퍼레이션의 매 호출 폴백 판단용. */
  isRedisReady(): boolean {
    return this.redis !== null && this.redisReady;
  }

  async get<T>(key: string): Promise<T | undefined> {
    if (this.redis && this.redisReady) {
      try {
        const raw = await this.redis.get(key);
        return raw === null ? undefined : (JSON.parse(raw) as T);
      } catch (err) {
        this.logger.warn(
          `Redis GET 실패(${key}), 로컬 메모리 캐시로 폴백합니다: ${(err as Error).message}`,
        );
      }
    }
    return this.getLocal<T>(key);
  }

  /**
   * get()과 달리 Redis 오류를 로컬 캐시로 조용히 폴백하지 않고 그대로 던진다.
   * songOrder/currentAnswers/currentReveal처럼 room 상태와 함께 여러 인스턴스가
   * 공유해야 하는 데이터에 쓴다. 폴백을 허용하면 "이 인스턴스에는 값이 없어서
   * 못 찾음"과 "Redis 자체가 잠깐 응답하지 않아서 못 찾음"을 구분할 수 없어,
   * 타이머 핸들러가 후자를 정상적인 no-op으로 오인해 아직 필요한 타이머 예약을
   * 지워버릴 수 있다. REDIS_HOST가 아예 설정되지 않은 단일 인스턴스 환경에서는
   * 로컬 캐시가 유일한 저장소이므로 그대로 로컬에서 읽는다.
   */
  async getStrict<T>(key: string): Promise<T | undefined> {
    if (!this.redis) {
      return this.getLocal<T>(key);
    }
    const raw = await this.redis.get(key);
    return raw === null ? undefined : (JSON.parse(raw) as T);
  }

  async set<T>(
    key: string,
    value: T,
    ttlSeconds: number = this.defaultTtlSeconds,
  ): Promise<void> {
    const serialized = JSON.stringify(value);

    if (this.redis && this.redisReady) {
      try {
        await this.redis.set(key, serialized, 'EX', ttlSeconds);
        return;
      } catch (err) {
        this.logger.warn(
          `Redis SET 실패(${key}), 로컬 메모리 캐시로 폴백합니다: ${(err as Error).message}`,
        );
      }
    }
    this.setLocal(key, serialized, ttlSeconds);
  }

  /**
   * set()과 달리 Redis 오류를 로컬 캐시로 조용히 폴백하지 않고 그대로 던진다.
   * roomId별 room 상태처럼 여러 인스턴스가 공유해야만 하는 데이터에 쓴다 — set()의
   * 폴백은 "이 인스턴스에서는 성공한 것처럼 보이지만 실제로는 다른 인스턴스와
   * 공유되지 않는 상태"를 만들어, 같은 room에 대해 이미 Redis에 반영된 다른 변경
   * (예: RoomTimerService의 타이머 ZSET)과 어긋나는 조용한 정합성 문제로 이어질 수
   * 있다. REDIS_HOST가 아예 설정되지 않은 단일 인스턴스 환경에서는 로컬 캐시가
   * 유일한 저장소이므로 그대로 로컬에 쓴다.
   */
  async setStrict<T>(
    key: string,
    value: T,
    ttlSeconds: number = this.defaultTtlSeconds,
  ): Promise<void> {
    const serialized = JSON.stringify(value);

    if (!this.redis) {
      this.setLocal(key, serialized, ttlSeconds);
      return;
    }
    await this.redis.set(key, serialized, 'EX', ttlSeconds);
  }

  async del(key: string): Promise<void> {
    if (this.redis && this.redisReady) {
      try {
        await this.redis.del(key);
      } catch (err) {
        this.logger.warn(`Redis DEL 실패(${key}): ${(err as Error).message}`);
      }
    }
    this.localCache.delete(key);
  }

  /** 캐시에 값이 있으면 반환하고, 없으면 factory를 실행해 저장 후 반환한다. */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T> | T,
    ttlSeconds: number = this.defaultTtlSeconds,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }

    const value = await factory();
    await this.set(key, value, ttlSeconds);
    return value;
  }

  private createRedisClient(): Redis | null {
    const host = process.env.REDIS_HOST;
    if (!host) {
      this.logger.warn(
        'REDIS_HOST가 설정되지 않아 로컬 메모리 캐시만 사용합니다.',
      );
      return null;
    }

    const redis = new Redis({
      host,
      port: Number(process.env.REDIS_PORT ?? 6379),
      password: process.env.REDIS_PASSWORD || undefined,
      db: Number(process.env.REDIS_DB ?? 0),
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => Math.min(times * 200, 5000),
    });

    redis.on('ready', () => {
      this.redisReady = true;
      this.logger.log('Redis 연결됨. Redis 캐시를 사용합니다.');
    });
    redis.on('error', (err) => {
      if (this.redisReady) {
        this.logger.warn(
          `Redis 오류 발생, 로컬 메모리 캐시로 폴백합니다: ${err.message}`,
          { event: 'redis_connection_failed' },
        );
      }
      this.redisReady = false;
    });
    redis.on('close', () => {
      this.redisReady = false;
    });

    redis.connect().catch((err: Error) => {
      this.logger.warn(
        `Redis 연결 실패, 로컬 메모리 캐시로 폴백합니다: ${err.message}`,
        { event: 'redis_connection_failed' },
      );
    });

    return redis;
  }

  private getLocal<T>(key: string): T | undefined {
    const entry = this.localCache.get(key);
    if (!entry) {
      return undefined;
    }
    if (entry.expiresAt !== null && entry.expiresAt < Date.now()) {
      this.localCache.delete(key);
      return undefined;
    }
    return JSON.parse(entry.value) as T;
  }

  private setLocal(key: string, serialized: string, ttlSeconds: number): void {
    const expiresAt = ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null;
    this.localCache.set(key, { value: serialized, expiresAt });
  }

  private sweepExpiredLocalEntries(): void {
    const now = Date.now();
    for (const [key, entry] of this.localCache) {
      if (entry.expiresAt !== null && entry.expiresAt < now) {
        this.localCache.delete(key);
      }
    }
  }
}
