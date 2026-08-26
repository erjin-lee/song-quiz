import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
} from '@nestjs/swagger';
import { AppService } from './app.service';
import { HealthCheckDto } from './dto/health-check';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /**
   * 루트 경로. ALB 헬스체크 경로를 /health로 옮긴 뒤에도 200을 그대로 유지한다 -
   * 롤백하거나 다른 프로브가 아직 /를 보고 있을 때 404가 되면 그대로 장애가 되기 때문이다.
   */
  @Get()
  @ApiOperation({ summary: '서비스 식별용 루트 응답' })
  getHello(): { service: string; status: string } {
    return this.appService.getHello();
  }

  @Get('health')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Liveness 체크',
    description:
      'Game 프로세스가 정상적으로 실행 중인지 확인합니다. 의존성은 확인하지 않으므로 ' +
      'Redis가 흔들려도 200을 반환합니다(ALB 헬스체크용).',
  })
  @ApiOkResponse({ type: HealthCheckDto })
  live(): HealthCheckDto {
    return this.appService.getLiveness();
  }

  @Get('ready')
  @ApiOperation({
    summary: 'Readiness 체크',
    description:
      'Game이 room 상태를 다룰 준비가 되었는지 확인합니다. Redis에 실제로 PING을 보내며, ' +
      '응답하지 않으면 503을 반환합니다. 배포 검증·운영 점검용이며 ALB 헬스체크 경로로는 ' +
      '쓰지 않습니다.',
  })
  @ApiOkResponse({ type: HealthCheckDto })
  @ApiServiceUnavailableResponse({ type: HealthCheckDto })
  async ready(): Promise<HealthCheckDto> {
    return this.appService.getReadiness();
  }
}
