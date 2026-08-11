import { Controller, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ChartScraperService } from './chart-scraper.service';
import { ScrapeChartQueryDto } from './dto/scrape-chart-query.dto';
import { ScrapeChartResultDto } from './dto/scrape-chart-result.dto';

@ApiTags('scraper')
@Controller('charts')
export class ChartScraperController {
  constructor(private readonly chartScraperService: ChartScraperService) {}

  @Post('scrape')
  @ApiOperation({
    summary:
      '멜론 차트(연대별/연도별) 스크래핑 후 아티스트/곡 저장 및 퀴즈 생성',
  })
  scrapeChart(
    @Query() query: ScrapeChartQueryDto,
  ): Promise<ScrapeChartResultDto> {
    return this.chartScraperService.scrapeChart(query.type, query.year);
  }
}
