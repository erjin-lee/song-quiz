import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { CacheService } from '../cache/cache.service';
import { HealthCheckDto } from './dto/health-check';

@Injectable()
export class AppService {
  private readonly commitSha = process.env.COMMIT_SHA?.slice(0, 7) ?? 'unknown';

  constructor(private readonly cacheService: CacheService) {}

  getHello(): { service: string; status: string } {
    return {
      service: 'song-quiz-game',
      status: 'ok',
    };
  }

  /**
   * Liveness — "이 프로세스가 살아서 요청을 받고 있는가"만 본다.
   *
   * 의존성을 일부러 확인하지 않는다. ALB 헬스체크가 이 경로를 보는데, 여기서 Redis까지
   * 검사하면 Redis가 잠깐 흔들릴 때 모든 인스턴스가 동시에 타겟그룹에서 빠져 서비스가
   * 통째로 내려간다. 이미 연결된 소켓은 그 순간에도 살아있으므로 트래픽을 끊는 쪽이 더
   * 나쁘다. 의존성 판단은 /ready가 한다.
   */
  getLiveness(): HealthCheckDto {
    return {
      status: 'ok',
      service: 'game',
      commitSha: this.commitSha,
      uptimeSec: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Readiness — "이 인스턴스가 room 상태를 다룰 준비가 되었는가".
   *
   * apps/game의 하드 의존성은 Redis 하나다. room 상태·분산 락·타이머가 전부 Redis 위에
   * 있고, Redis가 죽으면 상태를 바꾸는 요청은 로컬로 폴백하지 않고 실패한다(fail-closed,
   * ADR-0001 "Redis 장애 내성 보강"). 그래서 Redis가 응답하지 않으면 준비되지 않은 것으로
   * 본다.
   *
   * apps/api는 일부러 확인하지 않는다. 게임 시작 시 퀴즈 스냅샷을 받아오는 소프트 의존성이라
   * apps/api가 죽어도 진행 중인 게임·채팅·재접속은 계속 동작하는데, 여기서 확인하면 (1)
   * apps/api 장애가 game 전체 not_ready로 번지고(cascading failure) (2) 모든 인스턴스가
   * 헬스체크 주기마다 apps/api를 두드려 오히려 부하를 얹는다.
   */
  async getReadiness(): Promise<HealthCheckDto> {
    const redis = await this.checkRedis();

    const response: HealthCheckDto = {
      status: redis === 'error' ? 'not_ready' : 'ok',
      service: 'game',
      commitSha: this.commitSha,
      uptimeSec: Math.floor(process.uptime()),
      dependencies: {
        redis,
        api: 'ok', // api 상태 실제 체크 여부는 추후 재결정
      },
      timestamp: new Date().toISOString(),
    };

    if (response.status === 'not_ready') {
      throw new ServiceUnavailableException(response);
    }

    return response;
  }

  /**
   * REDIS_HOST가 아예 없는 단일 인스턴스 모드(로컬 개발, 테스트)는 Redis가 필요 없는
   * 정상 동작이므로 'error'가 아니라 'skipped'다. 이걸 구분하지 않으면 로컬에서 /ready가
   * 항상 503을 뱉어 헬스체크를 신뢰할 수 없게 된다.
   */
  private async checkRedis(): Promise<'ok' | 'error' | 'skipped'> {
    if (this.cacheService.getRedisClient() === null) {
      return 'skipped';
    }

    try {
      await this.cacheService.ping();
      return 'ok';
    } catch {
      return 'error';
    }
  }
}
