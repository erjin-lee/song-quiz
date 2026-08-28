import { CacheService } from '../cache/cache.service';
import { FakeRedis } from '../common/testing/fake-redis';
import { RoomItemDto } from './dto/room-item.dto';
import { RoomFencedStateStore } from './room-fenced-state.store';
import { RoomIndexRepository } from './room-index.repository';
import { RoomLockService } from './room-lock.service';
import { roomLockKey, RoomRepository } from './room.repository';

const buildRoom = (roomId: string, roomTtl: string): RoomItemDto => ({
  roomId,
  roomTtl,
  quizId: 'quiz-1',
  quizTtl: '아이유 퀴즈',
  quizDesc: null,
  songCount: 10,
  songLimit: 10,
  quizThumbImgUrl: null,
  atstIds: [],
  atstNms: [],
  isRandom: false,
  isUnlisted: false,
  isPrivate: false,
  speedModeEnabled: false,
  maxUserCnt: 6,
  curUserCnt: 1,
  hostUserId: 'user-1',
  participants: [],
  crtDt: '2026-08-26T00:00:00.000Z',
  gameStatus: 'WAITING',
  currentRound: null,
});

describe('RoomIndexRepository (Redis 장애 대응 / PERSIST 마이그레이션)', () => {
  let redis: FakeRedis;
  let cacheService: CacheService;
  let roomLockService: RoomLockService;
  let roomRepository: RoomRepository;
  let roomIndexRepository: RoomIndexRepository;

  beforeEach(() => {
    jest.useFakeTimers();
    delete process.env.REDIS_HOST;
    redis = new FakeRedis();

    // room.repository.spec.ts와 같은 이유로, FakeRedis를 CacheService의 클라이언트
    // 자리에 직접 끼워 "Redis 모드"로 돌린다.
    cacheService = new CacheService();
    Object.defineProperty(cacheService, 'redis', {
      value: redis,
      writable: true,
    });
    Object.defineProperty(cacheService, 'redisReady', {
      get: () => !redis.down,
    });

    roomLockService = new RoomLockService(cacheService);
    const stateStore = new RoomFencedStateStore(cacheService, roomLockService);
    roomRepository = new RoomRepository(cacheService, stateStore);
    roomIndexRepository = new RoomIndexRepository(
      cacheService,
      roomLockService,
      stateStore,
    );
  });

  afterEach(async () => {
    roomLockService.onModuleDestroy();
    Object.defineProperty(cacheService, 'redis', {
      value: null,
      writable: true,
    });
    await cacheService.onApplicationShutdown();
    jest.useRealTimers();
  });

  it('addToIndex는 Redis 상태 읽기가 실패하면 로컬 캐시로 폴백하지 않고 실패한다', async () => {
    // 락(eval)은 정상이고 상태 읽기/쓰기만 실패하는 상황.
    redis.dataCommandsDown = true;

    await expect(roomIndexRepository.addToIndex('room-1')).rejects.toThrow();

    // 로컬 메모리에 인덱스를 만들어두지 않았는지 확인한다(조용한 정합성 붕괴 방지).
    redis.dataCommandsDown = false;
    expect(redis.peek('room:index')).toBeUndefined();
    expect(await roomIndexRepository.getRoomIndex()).toEqual([]);
  });

  it('removeFromIndex도 Redis 상태 읽기가 실패하면 그대로 실패한다', async () => {
    await roomIndexRepository.addToIndex('room-1');
    expect(JSON.parse(redis.peek('room:index') as string)).toEqual(['room-1']);

    redis.dataCommandsDown = true;
    await expect(
      roomIndexRepository.removeFromIndex('room-1'),
    ).rejects.toThrow();

    redis.dataCommandsDown = false;
    expect(JSON.parse(redis.peek('room:index') as string)).toEqual(['room-1']);
  });

  it('room 락 안에서 room-index 락을 중첩해 잡아도 각 쓰기가 자기 락의 fencing 카운터를 쓰고, 빠져나오면 바깥 lease가 복원된다', async () => {
    const seenLockKeys: (string | undefined)[] = [];

    await roomLockService.withLock(roomLockKey('room-1'), async (lease) => {
      expect(lease.fence).toBe(1);
      await roomRepository.saveRoom(buildRoom('room-1', '방'));
      seenLockKeys.push(roomLockService.getCurrentLease()?.lockKey);

      // addToIndex가 내부에서 room-index 락을 중첩해 잡는다.
      await roomIndexRepository.addToIndex('room-1');

      // 중첩 락을 빠져나온 뒤에는 바깥 room lease가 그대로 돌아와야 한다.
      seenLockKeys.push(roomLockService.getCurrentLease()?.lockKey);
      await roomRepository.saveRoom(buildRoom('room-1', '방 갱신'));
    });

    expect(seenLockKeys).toEqual(['lock:room:room-1', 'lock:room:room-1']);
    // 두 락의 fencing 카운터가 서로 독립적으로 존재한다.
    expect(redis.peek('lock:fence:room:room-1')).toBe('1');
    expect(redis.peek('lock:fence:room-index')).toBe('1');
    expect(JSON.parse(redis.peek('room:index') as string)).toEqual(['room-1']);
    expect(
      (JSON.parse(redis.peek('room:room-1') as string) as RoomItemDto).roomTtl,
    ).toBe('방 갱신');
  });

  describe('room:index PERSIST 마이그레이션(onModuleInit)', () => {
    it('배포 전 코드가 남긴 room:index TTL을 제거해 다시 만료되지 않게 한다', async () => {
      // 옛 코드처럼 TTL이 걸린 채로 만들어진 index를 흉내낸다.
      await redis.set('room:index', JSON.stringify(['room-1']), 'EX', 1);

      roomIndexRepository.onModuleInit();
      // fire-and-forget이므로 내부 PERSIST 호출이 끝날 마이크로태스크 시간을 준다.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      // TTL이 그대로 남아있었다면 이 시점에 sweep으로 지워졌어야 한다.
      jest.advanceTimersByTime(2_000);
      expect(redis.peek('room:index')).toBeDefined();
    });

    it('REDIS_HOST가 없는(로컬 폴백) 환경에서는 아무 것도 하지 않는다', async () => {
      Object.defineProperty(cacheService, 'redis', {
        value: null,
        writable: true,
      });

      expect(() => roomIndexRepository.onModuleInit()).not.toThrow();
    });
  });
});
