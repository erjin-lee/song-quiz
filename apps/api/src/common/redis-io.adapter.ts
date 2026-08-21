import { INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { Server } from 'socket.io';
import { CacheService } from '../cache/cache.service';
import { delay } from './delay';

const READY_TIMEOUT_MS = 5_000;
/**
 * 부팅 중(app.listen() 이전) 어댑터 연결을 재시도하는 횟수. createIOServer는
 * connectToRedis가 끝난 뒤에야 호출되므로 이 시점까지는 아직 소켓이 하나도
 * 붙지 않아 재시도가 안전하다 — connectToRedis가 반환된 뒤에는 절대 재시도하지
 * 않는다(아래 클래스 주석 참고).
 */
const CONNECT_ATTEMPTS = 5;
const CONNECT_RETRY_BASE_MS = 500;
const CONNECT_RETRY_MAX_MS = 5_000;

/**
 * Socket.IO에 Redis pub/sub 어댑터를 붙여, 여러 API 인스턴스에 흩어진 소켓끼리도
 * `server.to(room).emit(...)` 같은 room 기반 브로드캐스트가 전달되게 한다.
 *
 * 연결 시도는 반드시 createIOServer(= 실제 소켓 연결을 받기 시작하는 시점, main.ts에서
 * app.listen() 중 호출됨) 이전에 끝나야 한다. Socket.IO의 Server#adapter(v)는 호출될
 * 때마다 각 namespace의 어댑터를 새로 생성한다(nsp._initAdapter) — 이미 room에 join한
 * 소켓이 있는 상태에서 어댑터를 교체하면 새 어댑터는 그 room 멤버십을 전혀 모르므로,
 * 연결 자체는 유지돼도 해당 소켓은 room:state·채팅을 더 이상 받지 못하고
 * fetchSockets()에서도 누락된다. 그래서 이 클래스는 createIOServer 호출 이후에는
 * 절대 어댑터를 재시도/교체하지 않는다 — connectToRedis 안에서 bounded 재시도로
 * 승부를 보고, 그래도 실패하면 이번 프로세스 생애주기 동안은 단일 인스턴스로 남는다
 * (멀티 인스턴스 정합성은 깨지지만 서비스 자체는 떠 있어야 하므로 부팅을 막지는 않는다).
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

    for (let attempt = 1; attempt <= CONNECT_ATTEMPTS; attempt++) {
      const connected = await this.attemptConnect(baseClient, attempt);
      if (connected) {
        return;
      }
      if (attempt < CONNECT_ATTEMPTS) {
        await delay(
          Math.min(attempt * CONNECT_RETRY_BASE_MS, CONNECT_RETRY_MAX_MS),
        );
      }
    }

    this.logger.error(
      `Socket.IO Redis 어댑터 연결에 ${CONNECT_ATTEMPTS}회 모두 실패해 단일 인스턴스로 동작합니다. ` +
        'REDIS_HOST 연결 상태를 확인하세요(재배포 전까지 room 브로드캐스트가 인스턴스 간에 전달되지 않습니다).',
    );
  }

  private async attemptConnect(
    baseClient: Redis,
    attempt: number,
  ): Promise<boolean> {
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
      return true;
    } catch (err) {
      this.logger.warn(
        `Socket.IO Redis 어댑터 연결 시도 실패(${attempt}/${CONNECT_ATTEMPTS}): ${(err as Error).message}`,
      );
      pubClient.disconnect();
      subClient.disconnect();
      return false;
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
