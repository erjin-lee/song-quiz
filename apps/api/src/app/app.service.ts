import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { HealthCheckDto } from './dto/health-check';
import { DataSource } from 'typeorm';
import { CacheService } from '../cache/cache.service';

@Injectable()
export class AppService {
  private readonly commitSha = process.env.COMMIT_SHA?.slice(0, 7) ?? 'unknown';

  constructor(
    private readonly dataSource: DataSource,
    private readonly cacheService: CacheService,
  ) {}

  // 예외적 any
  getHello(): any {
    return {
      service: 'song-quiz-api',
      status: 'ok',
    };
  }

  // 서버 라이브 상태 확인
  getLiveness(): HealthCheckDto {
    return {
      status: 'ok',
      service: 'api',
      commitSha: this.commitSha,
      uptimeSec: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  // 서버 실행 준비 상태 확인
  async getReadiness(): Promise<HealthCheckDto> {
    const database = await this.checkDatabase();
    const redis = await this.checkRedis();

    const response: HealthCheckDto = {
      status: database === 'ok' && redis === 'ok' ? 'ok' : 'not_ready',
      service: 'api',
      commitSha: this.commitSha,
      uptimeSec: Math.floor(process.uptime()),
      dependencies: {
        database,
        redis,
      },
      timestamp: new Date().toISOString(),
    };

    if (response.status === 'not_ready') {
      throw new ServiceUnavailableException(response);
    }

    return response;
  }

  private async checkDatabase(): Promise<'ok' | 'error'> {
    try {
      await this.dataSource.query('SELECT 1');
      return 'ok';
    } catch {
      return 'error';
    }
  }

  private async checkRedis(): Promise<'ok' | 'error'> {
    try {
      await this.cacheService.ping();

      return 'ok';
    } catch {
      return 'error';
    }
  }
}
