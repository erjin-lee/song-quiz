import { Test, TestingModule } from '@nestjs/testing';
import { CacheService } from '../cache/cache.service';
import { RoomLockService } from './room-lock.service';

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
