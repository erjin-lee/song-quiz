import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class HealthDependenciesDto {
  @ApiPropertyOptional({
    description: '데이터베이스 상태',
    example: 'ok',
    enum: ['ok', 'error'],
  })
  database?: 'ok' | 'error';

  @ApiPropertyOptional({
    description: 'Redis 상태',
    example: 'ok',
    enum: ['ok', 'error'],
  })
  redis?: 'ok' | 'error';
}

export class HealthCheckDto {
  @ApiProperty({
    description: '서버 상태',
    example: 'ok',
    enum: ['ok', 'not_ready'],
  })
  status: 'ok' | 'not_ready';

  @ApiProperty({
    description: '서비스 이름',
    example: 'api',
  })
  service: string;

  @ApiProperty({
    description: '현재 실행 중인 Git Commit SHA',
    example: 'abc1234',
  })
  commitSha: string;

  @ApiProperty({
    description: '프로세스 실행 시간(초)',
    example: 42,
  })
  uptimeSec: number;

  @ApiPropertyOptional({
    description: '핵심 의존성 상태',
    type: HealthDependenciesDto,
  })
  dependencies?: HealthDependenciesDto;

  @ApiProperty({
    description: '헬스체크 응답 시각',
    example: '2026-08-27T05:20:00.000Z',
  })
  timestamp: string;
}
