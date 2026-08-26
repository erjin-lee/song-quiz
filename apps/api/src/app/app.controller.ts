import { Controller, Get, HttpStatus, HttpCode } from '@nestjs/common';
import { AppService } from './app.service';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
} from '@nestjs/swagger';
import { HealthCheckDto } from './dto/health-check';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  // 예외적 any로 둔다
  getHello(): any {
    return this.appService.getHello();
  }

  @Get('health')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Liveness 체크',
    description: 'API 프로세스가 정상적으로 실행 중인지 확인합니다.',
  })
  @ApiOkResponse({
    type: HealthCheckDto,
  })
  live(): HealthCheckDto {
    return this.appService.getLiveness();
  }

  @Get('ready')
  @ApiOperation({
    summary: 'Readiness 체크',
    description: 'API가 실제 요청을 처리할 준비가 되었는지 확인합니다.',
  })
  @ApiOkResponse({
    type: HealthCheckDto,
  })
  @ApiServiceUnavailableResponse({
    type: HealthCheckDto,
  })
  async ready(): Promise<HealthCheckDto> {
    return this.appService.getReadiness();
  }
}
