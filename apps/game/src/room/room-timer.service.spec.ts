import { Test, TestingModule } from '@nestjs/testing';
import { getLogContext, LogContext, updateLogContext } from 'logger';
import { CacheService } from '../cache/cache.service';
import { RoomTimerService } from './room-timer.service';

describe('RoomTimerService', () => {
  let roomTimerService: RoomTimerService;
  let cacheService: CacheService;

  beforeEach(async () => {
    delete process.env.REDIS_HOST;

    const app: TestingModule = await Test.createTestingModule({
      providers: [RoomTimerService, CacheService],
    }).compile();

    roomTimerService = app.get<RoomTimerService>(RoomTimerService);
    cacheService = app.get<CacheService>(CacheService);
  });

  afterEach(async () => {
    roomTimerService.onModuleDestroy();
    await cacheService.onApplicationShutdown();
    jest.useRealTimers();
  });

  it('schedule 후 지정 시간이 지나면 등록된 핸들러가 정확히 1회 호출된다', async () => {
    jest.useFakeTimers();
    const handler = jest.fn();
    roomTimerService.registerHandler('round-timeout', handler);

    roomTimerService.schedule('round-timeout', 'room-1', 5);
    await jest.advanceTimersByTimeAsync(4_900);
    expect(handler).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(200);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('room-1');
  });

  it('같은 kind+key로 재schedule하면 이전 예약이 취소되고 새 지연시간 기준으로만 발화한다', async () => {
    jest.useFakeTimers();
    const handler = jest.fn();
    roomTimerService.registerHandler('round-timeout', handler);

    roomTimerService.schedule('round-timeout', 'room-1', 5);
    await jest.advanceTimersByTimeAsync(3_000);
    roomTimerService.schedule('round-timeout', 'room-1', 5);
    await jest.advanceTimersByTimeAsync(3_000);
    expect(handler).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(2_100);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('cancel은 실제 취소 시 true, 이미 없거나 발화한 뒤엔 false를 반환한다', async () => {
    jest.useFakeTimers();
    const handler = jest.fn();
    roomTimerService.registerHandler('disconnect-grace', handler);

    roomTimerService.schedule('disconnect-grace', 'user-1', 10);
    await expect(
      roomTimerService.cancel('disconnect-grace', 'user-1'),
    ).resolves.toBe(true);
    await expect(
      roomTimerService.cancel('disconnect-grace', 'user-1'),
    ).resolves.toBe(false);

    await jest.advanceTimersByTimeAsync(10_100);
    expect(handler).not.toHaveBeenCalled();

    roomTimerService.schedule('disconnect-grace', 'user-2', 5);
    await jest.advanceTimersByTimeAsync(5_100);
    await expect(
      roomTimerService.cancel('disconnect-grace', 'user-2'),
    ).resolves.toBe(false);
  });

  it('타이머로 발화된 핸들러 안에서도 updateLogContext/getLogContext가 동작한다(AsyncLocalStorage 컨텍스트가 없어 no-op이던 경로 수정 확인)', async () => {
    jest.useFakeTimers();
    let seenContext: Partial<LogContext> | undefined;
    const handler = jest.fn(() => {
      // leaveRoom/handleSpeedModeReveal 등 실제 핸들러가 하는 것과 동일한 패턴.
      updateLogContext({ roomId: 'room-1', userId: 'user-1' });
      seenContext = getLogContext();
    });
    roomTimerService.registerHandler('round-timeout', handler);

    roomTimerService.schedule('round-timeout', 'room-1', 5);
    await jest.advanceTimersByTimeAsync(5_100);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(seenContext?.roomId).toBe('room-1');
    expect(seenContext?.userId).toBe('user-1');
    expect(seenContext?.requestId).toBeTruthy();
  });

  it('speed-reveal과 speed-next는 서로 다른 슬롯으로 독립 관리된다', async () => {
    jest.useFakeTimers();
    const revealHandler = jest.fn();
    const nextHandler = jest.fn();
    roomTimerService.registerHandler('speed-reveal', revealHandler);
    roomTimerService.registerHandler('speed-next', nextHandler);

    roomTimerService.schedule('speed-reveal', 'room-1', 6);
    roomTimerService.schedule('speed-next', 'room-1', 4);

    await expect(
      roomTimerService.cancel('speed-reveal', 'room-1'),
    ).resolves.toBe(true);

    await jest.advanceTimersByTimeAsync(4_100);
    expect(nextHandler).toHaveBeenCalledTimes(1);
    expect(revealHandler).not.toHaveBeenCalled();
  });
});
