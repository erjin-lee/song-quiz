import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CacheService } from '../cache/cache.service';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;
  let cacheService: { getRedisClient: jest.Mock; ping: jest.Mock };

  const createController = async (
    cache: Partial<{ getRedisClient: jest.Mock; ping: jest.Mock }>,
  ) => {
    cacheService = {
      getRedisClient: jest.fn().mockReturnValue(null),
      ping: jest.fn().mockResolvedValue(undefined),
      ...cache,
    } as { getRedisClient: jest.Mock; ping: jest.Mock };

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        { provide: CacheService, useValue: cacheService },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  };

  describe('GET /', () => {
    // ALB 헬스체크 경로를 /health로 옮긴 뒤에도 /는 200을 유지해야 한다 - 롤백하거나
    // 아직 /를 보는 프로브가 남아 있을 때 404가 되면 그대로 장애가 된다.
    it('서비스 식별 정보를 200으로 반환한다', async () => {
      await createController({});

      expect(appController.getHello()).toEqual({
        service: 'song-quiz-game',
        status: 'ok',
      });
    });
  });

  describe('GET /health (liveness)', () => {
    it('의존성을 확인하지 않고 항상 ok를 반환한다', async () => {
      // Redis가 죽어 있어도 liveness는 영향을 받지 않아야 한다. 여기서 실패시키면
      // Redis 블립 하나로 모든 인스턴스가 타겟그룹에서 빠진다.
      await createController({
        getRedisClient: jest.fn().mockReturnValue({}),
        ping: jest.fn().mockRejectedValue(new Error('down')),
      });

      const result = appController.live();

      expect(result.status).toBe('ok');
      expect(result.service).toBe('game');
      expect(result.dependencies).toBeUndefined();
      expect(cacheService.ping).not.toHaveBeenCalled();
    });
  });

  describe('GET /ready (readiness)', () => {
    it('Redis가 응답하면 ok와 의존성 상태를 반환한다', async () => {
      await createController({
        getRedisClient: jest.fn().mockReturnValue({}),
        ping: jest.fn().mockResolvedValue(undefined),
      });

      const result = await appController.ready();

      expect(result.status).toBe('ok');
      expect(result.dependencies?.redis).toBe('ok');
      expect(cacheService.ping).toHaveBeenCalledTimes(1);
    });

    it('Redis가 응답하지 않으면 503(not_ready)을 던진다', async () => {
      await createController({
        getRedisClient: jest.fn().mockReturnValue({}),
        ping: jest.fn().mockRejectedValue(new Error('connection closed')),
      });

      await expect(appController.ready()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('REDIS_HOST가 없는 단일 인스턴스 모드는 skipped로 두고 ok를 반환한다', async () => {
      // 로컬 개발·테스트에서 Redis 없이 도는 것은 정상 동작이다. 이걸 error로 보면
      // 로컬에서 /ready가 항상 503이라 헬스체크를 신뢰할 수 없게 된다.
      await createController({
        getRedisClient: jest.fn().mockReturnValue(null),
      });

      const result = await appController.ready();

      expect(result.status).toBe('ok');
      expect(result.dependencies?.redis).toBe('skipped');
      expect(cacheService.ping).not.toHaveBeenCalled();
    });
  });
});
