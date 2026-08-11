import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt } from 'class-validator';
import { ChartType } from '../melon-scraper.client';

export class ScrapeChartQueryDto {
  @ApiProperty({
    enum: ChartType,
    description: '차트 타입 (AG: 연대별, YE: 연도별)',
  })
  @IsEnum(ChartType)
  type: ChartType;

  @ApiProperty({ description: '연도 (AG는 10년 단위, YE는 임의 연도)' })
  @Type(() => Number)
  @IsInt()
  year: number;
}
