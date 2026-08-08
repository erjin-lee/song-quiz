import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';

interface LocalCacheEntry {
  value: string;
  expiresAt: number | null;
}

@Injectable()
export class CacheService implements OnModuleDestroy {
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

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.localCacheSweepTimer);
    if (this.redis) {
      await this.redis.quit().catch(() => this.redis?.disconnect());
    }
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