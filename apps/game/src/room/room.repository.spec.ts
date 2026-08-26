import { CacheService } from '../cache/cache.service';
import { FakeRedis } from '../common/testing/fake-redis';
import { RoomItemDto } from './dto/room-item.dto';
import { roomLockKey, RoomRepository } from './room.repository';
import {
  LockLease,
  LockScopeMismatchError,
  RoomLockService,
  StaleFencingWriteError,
} from './room-lock.service';

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

describe('RoomRepository (Redis 장애 대응)', () => {
  let redis: FakeRedis;
  let cacheService: CacheService;
  let roomLockService: RoomLockService;
  let roomRepository: RoomRepository;

  beforeEach(() => {
    jest.useFakeTimers();
    delete process.env.REDIS_HOST;
    redis = new FakeRedis();

    // REDIS_HOST로 진짜 접속을 만들 수 없으니, 실제 CacheService 인스턴스의 클라이언트
    // 자리에 FakeRedis를 끼워 넣어 "Redis 모드"로 돌린다. get/set/eval 경로와 Lua
    // 스크립트를 실제 코드 그대로 태우기 위해서다(mock으로 대체하면 fencing 원자성을
    // 검증하는 의미가 없어진다).
    cacheService = new CacheService();
    Object.defineProperty(cacheService, 'redis', {
      value: redis,
      writable: true,
    });
    Object.defineProperty(cacheService, 'redisReady', {
      get: () => !redis.down,
    });

    roomLockService = new RoomLockService(cacheService);
    roomRepository = new RoomRepository(cacheService, roomLockService);
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

    await expect(roomRepository.addToIndex('room-1')).rejects.toThrow();

    // 로컬 메모리에 인덱스를 만들어두지 않았는지 확인한다(조용한 정합성 붕괴 방지).
    redis.dataCommandsDown = false;
    expect(redis.peek('room:index')).toBeUndefined();
    expect(await roomRepository.getRoomIndex()).toEqual([]);
  });

  it('removeFromIndex도 Redis 상태 읽기가 실패하면 그대로 실패한다', async () => {
    await roomRepository.addToIndex('room-1');
    expect(JSON.parse(redis.peek('room:index') as string)).toEqual(['room-1']);

    redis.dataCommandsDown = true;
    await expect(roomRepository.removeFromIndex('room-1')).rejects.toThrow();

    redis.dataCommandsDown = false;
    expect(JSON.parse(redis.peek('room:index') as string)).toEqual(['room-1']);
  });

  it('락 TTL이 만료된 뒤 새 워커가 락을 잡으면, 오래된 fencing token의 쓰기는 거부되고 최신 token의 쓰기만 남는다', async () => {
    let staleLease: LockLease | undefined;
    let attemptStaleWrite: () => void = () => undefined;
    let staleWriteError: unknown;

    // 워커 A: 락을 잡고 임계구역 안에서 대기한다(아직 lease는 유효하다고 믿는다).
    const workerA = roomLockService
      .withLock('room:room-1', async (lease) => {
        staleLease = lease;
        await new Promise<void>((resolve) => {
          attemptStaleWrite = resolve;
        });
        try {
          await roomRepository.saveRoom(buildRoom('room-1', 'A가 쓴 방'));
        } catch (err) {
          staleWriteError = err;
        }
      })
      .catch((err: unknown) => err);
    await jest.advanceTimersByTimeAsync(10);
    expect(staleLease?.fence).toBe(1);

    // Redis 장애/지연으로 A의 락 key만 TTL 만료된 상황.
    redis.forceExpire('lock:room:room-1');

    // 워커 B: 같은 방의 락을 새로 잡고(fence 2) 상태를 쓴다.
    let freshFence: number | null = null;
    await roomLockService.withLock('room:room-1', async (lease) => {
      freshFence = lease.fence;
      await roomRepository.saveRoom(buildRoom('room-1', 'B가 쓴 방'));
    });
    expect(freshFence).toBe(2);

    // A는 아직 lease가 만료되지 않았다고 믿지만, fencing token이 뒤처져 거부돼야 한다.
    attemptStaleWrite();
    await jest.advanceTimersByTimeAsync(10);
    await workerA;

    expect(staleWriteError).toBeInstanceOf(StaleFencingWriteError);
    expect(
      (JSON.parse(redis.peek('room:room-1') as string) as RoomItemDto).roomTtl,
    ).toBe('B가 쓴 방');
  });

  it('락 TTL이 만료된 뒤 새 워커가 상태를 기록했다면, 오래된 워커의 삭제는 거부되고 상태가 살아남는다', async () => {
    let attemptStaleDelete: () => void = () => undefined;
    let staleDeleteError: unknown;

    // 워커 A: 락을 잡고 정리 직전까지 온 상태(deleteRoom 경로).
    const workerA = roomLockService
      .withLock(roomLockKey('room-1'), async () => {
        await new Promise<void>((resolve) => {
          attemptStaleDelete = resolve;
        });
        try {
          await roomRepository.deleteRoomRecord('room-1');
        } catch (err) {
          staleDeleteError = err;
        }
      })
      .catch((err: unknown) => err);
    await jest.advanceTimersByTimeAsync(10);

    redis.forceExpire('lock:room:room-1');

    // 워커 B: 새 락(fence 2)으로 방 상태를 기록한다.
    await roomLockService.withLock(roomLockKey('room-1'), async () => {
      await roomRepository.saveRoom(buildRoom('room-1', 'B가 쓴 방'));
    });

    attemptStaleDelete();
    await jest.advanceTimersByTimeAsync(10);
    await workerA;

    expect(staleDeleteError).toBeInstanceOf(StaleFencingWriteError);
    // A의 삭제가 통과했다면 B가 방금 쓴 방이 사라졌을 것이다.
    expect(
      (JSON.parse(redis.peek('room:room-1') as string) as RoomItemDto).roomTtl,
    ).toBe('B가 쓴 방');
  });

  it('라운드 데이터 삭제도 오래된 fencing token이면 거부된다', async () => {
    let attemptStaleDelete: () => void = () => undefined;
    let staleDeleteError: unknown;

    const workerA = roomLockService
      .withLock(roomLockKey('room-1'), async () => {
        await new Promise<void>((resolve) => {
          attemptStaleDelete = resolve;
        });
        try {
          await roomRepository.deleteSongOrder('room-1');
        } catch (err) {
          staleDeleteError = err;
        }
      })
      .catch((err: unknown) => err);
    await jest.advanceTimersByTimeAsync(10);

    redis.forceExpire('lock:room:room-1');
    await roomLockService.withLock(roomLockKey('room-1'), async () => {
      await roomRepository.setSongOrder('room-1', ['song-b']);
    });

    attemptStaleDelete();
    await jest.advanceTimersByTimeAsync(10);
    await workerA;

    expect(staleDeleteError).toBeInstanceOf(StaleFencingWriteError);
    expect(await roomRepository.getSongOrder('room-1')).toEqual(['song-b']);
  });

  it('삭제는 Redis 장애를 삼키지 않고 실패시킨다(정리했다고 믿는 상태를 만들지 않는다)', async () => {
    await roomLockService.withLock(roomLockKey('room-1'), async () => {
      await roomRepository.saveRoom(buildRoom('room-1', '남아있어야 함'));
    });

    redis.dataCommandsDown = true;
    await expect(
      roomLockService.withLock(roomLockKey('room-1'), async () => {
        await roomRepository.deleteRoomRecord('room-1');
      }),
    ).rejects.toThrow();

    redis.dataCommandsDown = false;
    expect(redis.peek('room:room-1')).toBeDefined();
  });

  it('room 락 안에서 room-index 락을 중첩해 잡아도 각 쓰기가 자기 락의 fencing 카운터를 쓰고, 빠져나오면 바깥 lease가 복원된다', async () => {
    const seenLockKeys: (string | undefined)[] = [];

    await roomLockService.withLock(roomLockKey('room-1'), async (lease) => {
      expect(lease.fence).toBe(1);
      await roomRepository.saveRoom(buildRoom('room-1', '방'));
      seenLockKeys.push(roomLockService.getCurrentLease()?.lockKey);

      // addToIndex가 내부에서 room-index 락을 중첩해 잡는다.
      await roomRepository.addToIndex('room-1');

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

  it('자기를 보호하지 않는 락 아래에서 room 상태를 바꾸려 하면 LockScopeMismatchError로 막힌다', async () => {
    // room-index 락만 쥔 채 room 상태를 쓰면, fencing이 엉뚱한 카운터를 검사하게 된다.
    await expect(
      roomLockService.withLock('room-index', async () => {
        await roomRepository.saveRoom(buildRoom('room-9', '잘못된 락'));
      }),
    ).rejects.toBeInstanceOf(LockScopeMismatchError);

    expect(redis.peek('room:room-9')).toBeUndefined();
  });

  it('lease가 유효한 최신 워커의 쓰기는 그대로 허용된다', async () => {
    await roomLockService.withLock('room:room-2', async () => {
      await roomRepository.saveRoom(buildRoom('room-2', '정상 저장'));
      await roomRepository.setSongOrder('room-2', ['song-1', 'song-2']);
    });

    expect(
      (JSON.parse(redis.peek('room:room-2') as string) as RoomItemDto).roomTtl,
    ).toBe('정상 저장');
    expect(await roomRepository.getSongOrder('room-2')).toEqual([
      'song-1',
      'song-2',
    ]);
  });
});
