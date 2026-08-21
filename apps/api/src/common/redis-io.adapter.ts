import { INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { Server } from 'socket.io';
import { CacheService } from '../cache/cache.service';

const READY_TIMEOUT_MS = 5_000;

/**
 * Socket.IO에 Redis pub/sub 어댑터를 붙여, 여러 API 인스턴스에 흩어진 소켓끼리도
 * `server.to(room).emit(...)` 같은 room 기반 브로드캐스트가 전달되게 한다.
 * REDIS_HOST가 설정되지 않았거나(로컬 개발) 어댑터용 커넥션 확보에 실패하면
 * 어댑터 없이(단일 인스턴스 동작) 부팅을 계속 진행한다 — 멀티 인스턴스 정합성은
 * 깨지지만 서비스 자체는 떠 있어야 하므로 부팅을 막지 않는다.
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapterConstructor?: ReturnType<typeof createAdapter>;

  constructor(
    app: INestApplicationContext,
    private readonly cacheService: CacheService,
  ) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    const baseClient = this.cacheService.getRedisClient();
    if (!baseClient) {
      this.logger.warn(
        'REDIS_HOST가 설정되지 않아 Socket.IO Redis 어댑터 없이 단일 인스턴스로 동작합니다.',
      );
      return;
    }

    const pubClient = baseClient.duplicate();
    const subClient = baseClient.duplicate();

    try {
      // 원본 클라이언트와 마찬가지로 lazyConnect: true를 상속하므로, duplicate()만으로는
      // 연결이 시작되지 않는다 — 명시적으로 connect()를 호출해야 한다.
      await Promise.all([
        pubClient.connect(),
        subClient.connect(),
        this.waitReady(pubClient),
        this.waitReady(subClient),
      ]);
      this.adapterConstructor = createAdapter(pubClient, subClient);
      this.logger.log('Socket.IO Redis 어댑터를 연결했습니다.');
    } catch (err) {
      this.logger.error(
        `Socket.IO Redis 어댑터 연결 실패, 단일 인스턴스로 동작합니다: ${(err as Error).message}`,
      );
      pubClient.disconnect();
      subClient.disconnect();
    }
  }

  createIOServer(port: number, options?: unknown): unknown {
    const server = super.createIOServer(port, options) as Server;
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }

  private waitReady(client: Redis): Promise<void> {
    if (client.status === 'ready') {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        client.off('ready', onReady);
        client.off('error', onError);
        reject(new Error('Redis 연결 대기 시간 초과'));
      }, READY_TIMEOUT_MS);

      const onReady = () => {
        clearTimeout(timer);
        client.off('error', onError);
        resolve();
      };
      const onError = (err: Error) => {
        clearTimeout(timer);
        client.off('ready', onReady);
        reject(err);
      };

      client.once('ready', onReady);
      client.once('error', onError);
    });
  }
}
