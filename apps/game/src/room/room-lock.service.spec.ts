import { Test, TestingModule } from '@nestjs/testing';
import { CacheService } from '../cache/cache.service';
import { FakeRedis } from '../common/testing/fake-redis';
import {
  LockAcquireFailedError,
  LockLease,
  LockLeaseLostError,
  RoomLockService,
} from './room-lock.service';

describe('RoomLockService', () => {
  let roomLockService: RoomLockService;
  let cacheService: CacheService;

  beforeEach(async () => {
    delete process.env.REDIS_HOST;

    const app: TestingModule = await Test.createTestingModule({
      providers: [RoomLockService, CacheService],
    }).compile();

    roomLockService = app.get<RoomLockService>(RoomLockService);
    cacheService = app.get<CacheService>(CacheService);
  });

  afterEach(async () => {
    await cacheService.onApplicationShutdown();
  });

  it('같은 key에 대한 작업은 도착한 순서대로 직렬 실행된다(로컬 폴백)', async () => {
    const order: number[] = [];

    const task = (id: number, delayMs: number) =>
      roomLockService.withLock('room-1', async () => {
        order.push(id);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        order.push(-id);
      });

    await Promise.all([task(1, 30), task(2, 10), task(3, 0)]);

    expect(order).toEqual([1, -1, 2, -2, 3, -3]);
  });

  it('먼저 걸린 작업이 실패해도 체인이 끊기지 않고 다음 작업이 순서대로 실행된다', async () => {
    const order: string[] = [];

    const failing = roomLockService
      .withLock('room-2', async () => {
        order.push('task1-start');
        throw new Error('boom');
      })
      .catch(() => undefined);

    const succeeding = roomLockService.withLock('room-2', async () => {
      order.push('task2-start');
    });

    await Promise.all([failing, succeeding]);

    expect(order).toEqual(['task1-start', 'task2-start']);
  });

  it('서로 다른 key는 병렬로 실행될 수 있다', async () => {
    const order: string[] = [];

    const slow = roomLockService.withLock('room-a', async () => {
      order.push('a-start');
      await new Promise((resolve) => setTimeout(resolve, 20));
      order.push('a-end');
    });
    const fast = roomLockService.withLock('room-b', async () => {
      order.push('b-start');
      order.push('b-end');
    });

    await Promise.all([slow, fast]);

    expect(order[0]).toBe('a-start');
    expect(order[1]).toBe('b-start');
    expect(order[2]).toBe('b-end');
    expect(order[3]).toBe('a-end');
  });
});

describe('RoomLockService (Redis 모드)', () => {
  let redis: FakeRedis;
  let roomLockService: RoomLockService;

  beforeEach(() => {
    jest.useFakeTimers();
    redis = new FakeRedis();
    // RoomLockService가 실제로 쓰는 CacheService 표면은 이 둘뿐이다.
    const cacheService = {
      getRedisClient: () => redis,
      isRedisReady: () => !redis.down,
    } as unknown as CacheService;
    roomLockService = new RoomLockService(cacheService);
  });

  afterEach(() => {
    roomLockService.onModuleDestroy();
    jest.useRealTimers();
  });

  /** 락을 잡은 채 대기하는 작업을 띄우고, 그 lease와 "끝내기" 함수를 돌려준다. */
  const holdLock = async (key: string) => {
    let lease: LockLease | undefined;
    let finish: () => void = () => undefined;
    const settled = roomLockService.withLock(key, async (acquired) => {
      lease = acquired;
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return 'done';
    });
    // 락 획득(eval)이 마이크로태스크로 끝날 때까지 흘려보낸다.
    await jest.advanceTimersByTimeAsync(10);
    return { lease: lease as LockLease, finish, settled };
  };

  it('하트비트가 일시적으로 실패해도 TTL 안에 복구되면 lease를 유지하고 작업이 계속된다', async () => {
    const { lease, finish, settled } = await holdLock('room-1');

    redis.down = true;
    // 하트비트 주기(4초)와 그 다음 재시도가 모두 실패하는 구간.
    await jest.advanceTimersByTimeAsync(5_000);
    expect(lease.lost).toBe(false);
    expect(redis.evalKinds.filter((kind) => kind === 'extend')).toHaveLength(0);

    redis.down = false;
    await jest.advanceTimersByTimeAsync(1_500);
    expect(redis.evalKinds).toContain('extend');

    // 원래 TTL(획득 후 8초)을 넘겨도 갱신된 lease 덕분에 살아있어야 한다.
    await jest.advanceTimersByTimeAsync(3_000);
    expect(lease.lost).toBe(false);
    expect(lease.signal.aborted).toBe(false);

    finish();
    await expect(settled).resolves.toBe('done');
  });

  it('하트비트가 lease 만료 시각까지 복구되지 않으면 abort하고 이후 상태 쓰기를 차단한다', async () => {
    let writeError: unknown;
    let lease: LockLease | undefined;

    // 만료는 타이머를 흘리는 도중 일어나므로 거부 핸들러를 미리 붙여둔다.
    const settled = roomLockService
      .withLock('room-2', async (acquired) => {
        lease = acquired;
        // 임계구역이 10초 동안 이어지는 상황(락 TTL 8초보다 길다).
        await new Promise<void>((resolve) => setTimeout(resolve, 10_000));
        try {
          // 상태 쓰기 직전마다 RoomRepository가 호출하는 것과 같은 경계 검사.
          roomLockService.assertLeaseHeld();
        } catch (err) {
          writeError = err;
        }
        return 'done';
      })
      .catch((err: unknown) => err);

    await jest.advanceTimersByTimeAsync(10);
    redis.down = true;

    await jest.advanceTimersByTimeAsync(9_000);
    expect(lease?.lost).toBe(true);
    expect(lease?.reason).toBe('LEASE_EXPIRED');
    expect(lease?.signal.aborted).toBe(true);

    await jest.advanceTimersByTimeAsync(2_000);
    expect(writeError).toBeInstanceOf(LockLeaseLostError);
    // 작업이 값을 반환했더라도 상호배제가 보장되지 않았으므로 성공으로 위장하지 않는다.
    expect(await settled).toBeInstanceOf(LockLeaseLostError);
  });

  it('Redis가 응답하면서 "네 token이 아니다"라고 답하면 TTL을 더 기다리지 않고 즉시 lease를 잃는다', async () => {
    const { lease, finish, settled } = await holdLock('room-3');

    // 다른 인스턴스가 이미 이 락을 가져간 상황.
    redis.forceExpire('lock:room-3');
    await jest.advanceTimersByTimeAsync(4_500);

    expect(lease.lost).toBe(true);
    expect(lease.reason).toBe('LOCK_NOT_HELD');

    finish();
    await expect(settled).rejects.toBeInstanceOf(LockLeaseLostError);
  });

  it('락 획득 중 짧은 Redis 장애는 retry budget 안에서 흡수되어 결국 획득에 성공한다', async () => {
    redis.down = true;
    setTimeout(() => {
      redis.down = false;
    }, 500);

    const settled = roomLockService.withLock('room-4', async () => 'ok');
    await jest.advanceTimersByTimeAsync(1_000);

    await expect(settled).resolves.toBe('ok');
  });

  it('Redis 장애가 retry budget을 넘기면 REDIS_UNAVAILABLE로 실패한다', async () => {
    redis.down = true;

    const failure = roomLockService
      .withLock('room-5', async () => 'ok')
      .catch((err: unknown) => err);
    await jest.advanceTimersByTimeAsync(2_000);

    const err = await failure;
    expect(err).toBeInstanceOf(LockAcquireFailedError);
    expect((err as LockAcquireFailedError).errorCode).toBe('REDIS_UNAVAILABLE');
  });

  it('Redis는 정상인데 다른 워커가 계속 점유 중이면 LOCK_BUSY로 실패한다', async () => {
    const { finish, settled } = await holdLock('room-6');

    const contender = roomLockService
      .withLock('room-6', async () => 'ok')
      .catch((err: unknown) => err);
    // 경합 예산(LOCK_ACQUIRE_TIMEOUT_MS = 12초)을 모두 소진시킨다.
    await jest.advanceTimersByTimeAsync(12_500);

    const err = await contender;
    expect(err).toBeInstanceOf(LockAcquireFailedError);
    expect((err as LockAcquireFailedError).errorCode).toBe('LOCK_BUSY');

    finish();
    await jest.advanceTimersByTimeAsync(10);
    await settled.catch(() => undefined);
  });

  it('락을 다시 획득할 때마다 fencing token이 단조 증가한다', async () => {
    const first = await holdLock('room-7');
    expect(first.lease.fence).toBe(1);
    first.finish();
    await expect(first.settled).resolves.toBe('done');

    const second = await holdLock('room-7');
    expect(second.lease.fence).toBe(2);
    second.finish();
    await expect(second.settled).resolves.toBe('done');
  });
});
