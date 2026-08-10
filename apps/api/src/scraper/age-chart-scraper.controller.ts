import { Controller, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AgeChartScraperService } from './age-chart-scraper.service';
import { ScrapeAgeChartResultDto } from './dto/scrape-age-chart-result.dto';

@ApiTags('scraper')
@Controller('charts/age')
export class AgeChartScraperController {
  constructor(
    private readonly ageChartScraperService: AgeChartScraperService,
  ) {}

  @Post(':decade/scrape')
  @ApiOperation({
    summary: '멜론 연대별 인기 차트 스크래핑 후 아티스트/곡 저장 및 퀴즈 생성',
  })
  scrapeAgeChart(
    @Param('decade', ParseIntPipe) decade: number,
  ): Promise<ScrapeAgeChartResultDto> {
    return this.ageChartScraperService.scrapeAgeChart(decade);
  }
}
