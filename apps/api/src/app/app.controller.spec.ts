import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { CacheService } from '../cache/cache.service';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;
  let dataSource: { query: jest.Mock };
  let cacheService: { getRedisClient: jest.Mock; ping: jest.Mock };

  const createController = async (
    overrides: {
      dataSource?: Partial<{ query: jest.Mock }>;
      cacheService?: Partial<{ getRedisClient: jest.Mock; ping: jest.Mock }>;
    } = {},
  ) => {
    dataSource = {
      query: jest.fn().mockResolvedValue([{ 1: 1 }]),
      ...overrides.dataSource,
    } as { query: jest.Mock };
    cacheService = {
      getRedisClient: jest.fn().mockReturnValue({}),
      ping: jest.fn().mockResolvedValue(undefined),
      ...overrides.cacheService,
    } as { getRedisClient: jest.Mock; ping: jest.Mock };

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        { provide: DataSource, useValue: dataSource },
        { provide: CacheService, useValue: cacheService },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  };

  describe('GET /', () => {
    it('서비스 식별 정보를 반환한다', async () => {
      await createController();

      expect(appController.getHello()).toEqual({
        service: 'song-quiz-api',
        status: 'ok',
      });
    });
  });

  describe('GET /health (liveness)', () => {
    it('의존성을 확인하지 않고 항상 ok를 반환한다', async () => {
      // DB/Redis가 죽어 있어도 liveness는 영향을 받지 않아야 한다. 여기서 실패시키면
      // 일시적 DB/Redis 장애 하나로 모든 인스턴스가 타겟그룹에서 빠진다.
      await createController({
        dataSource: { query: jest.fn().mockRejectedValue(new Error('down')) },
        cacheService: { ping: jest.fn().mockRejectedValue(new Error('down')) },
      });

      const result = appController.live();

      expect(result.status).toBe('ok');
      expect(result.service).toBe('api');
      expect(result.dependencies).toBeUndefined();
      expect(dataSource.query).not.toHaveBeenCalled();
      expect(cacheService.ping).not.toHaveBeenCalled();
    });
  });

  describe('GET /ready (readiness)', () => {
    it('DB와 Redis가 모두 응답하면 ok와 의존성 상태를 반환한다', async () => {
      await createController();

      const result = await appController.ready();

      expect(result.status).toBe('ok');
      expect(result.dependencies).toEqual({ database: 'ok', redis: 'ok' });
    });

    it('DB가 응답하지 않으면 503(not_ready)을 던진다', async () => {
      await createController({
        dataSource: {
          query: jest.fn().mockRejectedValue(new Error('connection lost')),
        },
      });

      await expect(appController.ready()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('Redis가 응답하지 않으면 503(not_ready)을 던진다', async () => {
      await createController({
        cacheService: {
          ping: jest.fn().mockRejectedValue(new Error('connection closed')),
        },
      });

      await expect(appController.ready()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });
});
