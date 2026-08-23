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
 * Socket.IO에 Redis pub/sub 어댑터를 붙여, 여러 Game 인스턴스에 흩어진 소켓끼리도
 * `server.to(room).emit(...)` 같은 room 기반 브로드캐스트가 전달되게 한다.
 *
 * 연결 시도는 반드시 createIOServer(= 실제 소켓 연결을 받기 시작하는 시점, main.ts에서
 * app.listen() 중 호출됨) 이전에 끝나야 한다. Socket.IO의 Server#adapter(v)는 호출될
 * 때마다 각 namespace의 어댑터를 새로 생성한다(nsp._initAdapter) — 이미 room에 join한
 * 소켓이 있는 상태에서 어댑터를 교체하면 새 어댑터는 그 room 멤버십을 전혀 모르므로,
 * 연결 자체는 유지돼도 해당 소켓은 room:state·채팅을 더 이상 받지 못하고
 * fetchSockets()에서도 누락된다. 그래서 이 클래스는 createIOServer 호출 이후에는
 * 절대 어댑터를 재시도/교체하지 않는다 — connectToRedis 안에서 bounded 재시도로
 * 승부를 본다.
 *
 * REDIS_HOST가 설정됐는데도 모든 재시도가 실패하면 로컬 폴백으로 조용히 넘어가지
 * 않고 예외를 던져 부팅 자체를 실패시킨다(main.ts가 이를 받아 process.exit). 로컬
 * 폴백으로 계속 뜨면, 이후 캐시/락/타이머용 Redis(base client)만 재연결에 성공했을
 * 때 room 상태/락/타이머는 공유되는데 소켓 브로드캐스트·fetchSockets만 이 인스턴스
 * 안에 고립된 split-brain이 재배포 전까지 지속된다 — 차라리 이 인스턴스가 트래픽을
 * 받지 못하고 재시작을 반복하는 편이 안전하다. REDIS_HOST가 아예 설정되지 않은
 * 순수 단일 인스턴스(로컬 개발) 환경에서만 로컬 폴백을 허용한다.
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

    const message = `Socket.IO Redis 어댑터 연결에 ${CONNECT_ATTEMPTS}회 모두 실패했습니다. REDIS_HOST 연결 상태를 확인하세요.`;
    // 부팅 단계라 요청/소켓 컨텍스트(AsyncLocalStorage)가 없어 updateLogContext는
    // 아무 효과가 없다 — event/errorCode를 여기서 직접 로그 호출에 실어야 한다.
    this.logger.error(message, {
      event: 'redis_connection_failed',
      errorCode: 'SOCKET_IO_REDIS_ADAPTER_CONNECT_FAILED',
    });
    throw new Error(message);
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
