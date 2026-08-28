import { HttpException } from '@nestjs/common';
import { CacheService } from '../cache/cache.service';
import { FakeRedis } from '../common/testing/fake-redis';
import { RoomAbuseGuardRepository } from './room-abuse-guard.repository';

describe('RoomAbuseGuardRepository (IP 기준 abuse 방지 카운터)', () => {
  let redis: FakeRedis;
  let cacheService: CacheService;
  let roomAbuseGuard: RoomAbuseGuardRepository;

  beforeEach(() => {
    delete process.env.REDIS_HOST;
    redis = new FakeRedis();

    cacheService = new CacheService();
    Object.defineProperty(cacheService, 'redis', {
      value: redis,
      writable: true,
    });
    Object.defineProperty(cacheService, 'redisReady', {
      get: () => !redis.down,
    });

    roomAbuseGuard = new RoomAbuseGuardRepository(cacheService);
  });

  afterEach(async () => {
    Object.defineProperty(cacheService, 'redis', {
      value: null,
      writable: true,
    });
    await cacheService.onApplicationShutdown();
  });

  describe('assertRoomCreationAllowed (방 생성 rate limit 원자성)', () => {
    it('같은 IP로 몰린 동시 요청도 카운터가 원자적으로 증가해 한도(10회/60초)를 정확히 지킨다', async () => {
      const clientIp = '203.0.113.1';

      const results = await Promise.allSettled(
        Array.from({ length: 15 }, () =>
          roomAbuseGuard.assertRoomCreationAllowed(clientIp),
        ),
      );

      const allowed = results.filter((r) => r.status === 'fulfilled').length;
      const blocked = results.filter((r) => r.status === 'rejected').length;
      expect(allowed).toBe(10);
      expect(blocked).toBe(5);
      results
        .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
        .forEach((r) => expect(r.reason).toBeInstanceOf(HttpException));
    });

    it('한도를 넘긴 IP가 있어도 다른 IP의 카운터에는 영향을 주지 않는다', async () => {
      for (let i = 0; i < 10; i += 1) {
        await roomAbuseGuard.assertRoomCreationAllowed('203.0.113.1');
      }
      await expect(
        roomAbuseGuard.assertRoomCreationAllowed('203.0.113.1'),
      ).rejects.toThrow(HttpException);

      await expect(
        roomAbuseGuard.assertRoomCreationAllowed('203.0.113.2'),
      ).resolves.toBeUndefined();
    });
  });

  describe('비밀번호 시도 제한', () => {
    it('같은 방+IP에서 5회 틀리면 429를 던지고, 다른 IP는 영향받지 않는다', async () => {
      for (let i = 0; i < 5; i += 1) {
        await roomAbuseGuard.recordFailedPasswordAttempt(
          'room-1',
          '203.0.113.1',
        );
      }

      await expect(
        roomAbuseGuard.assertPasswordAttemptAllowed('room-1', '203.0.113.1'),
      ).rejects.toThrow(HttpException);

      await expect(
        roomAbuseGuard.assertPasswordAttemptAllowed('room-1', '203.0.113.2'),
      ).resolves.toBeUndefined();
    });

    it('clearPasswordAttempts로 초기화하면 다시 시도할 수 있다', async () => {
      for (let i = 0; i < 5; i += 1) {
        await roomAbuseGuard.recordFailedPasswordAttempt(
          'room-1',
          '203.0.113.1',
        );
      }
      await roomAbuseGuard.clearPasswordAttempts('room-1', '203.0.113.1');

      await expect(
        roomAbuseGuard.assertPasswordAttemptAllowed('room-1', '203.0.113.1'),
      ).resolves.toBeUndefined();
    });
  });
});
