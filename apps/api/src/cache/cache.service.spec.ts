import { Test, TestingModule } from '@nestjs/testing';
import { CacheService } from './cache.service';

describe('CacheService', () => {
  let cacheService: CacheService;

  beforeEach(async () => {
    delete process.env.REDIS_HOST;

    const app: TestingModule = await Test.createTestingModule({
      providers: [CacheService],
    }).compile();

    cacheService = app.get<CacheService>(CacheService);
  });

  afterEach(async () => {
    await cacheService.onModuleDestroy();
  });

  it('REDIS_HOST가 없으면 로컬 메모리 캐시로 값을 저장하고 조회한다', async () => {
    await cacheService.set('key', { foo: 'bar' });

    expect(await cacheService.get('key')).toEqual({ foo: 'bar' });
  });

  it('존재하지 않는 키는 undefined를 반환한다', async () => {
    expect(await cacheService.get('missing')).toBeUndefined();
  });

  it('del로 값을 삭제하면 이후 조회 시 undefined를 반환한다', async () => {
    await cacheService.set('key', 'value');
    await cacheService.del('key');

    expect(await cacheService.get('key')).toBeUndefined();
  });

  it('ttlSeconds가 지나면 값이 만료되어 undefined를 반환한다', async () => {
    await cacheService.set('key', 'value', 0.05);

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(await cacheService.get('key')).toBeUndefined();
  });

  it('getOrSet은 캐시가 없을 때만 factory를 호출한다', async () => {
    const factory = jest.fn().mockResolvedValue('computed');

    const first = await cacheService.getOrSet('key', factory);
    const second = await cacheService.getOrSet('key', factory);

    expect(first).toBe('computed');
    expect(second).toBe('computed');
    expect(factory).toHaveBeenCalledTimes(1);
  });
});