import { Controller, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ScrapeArtistResultDto } from './dto/scrape-artist-result.dto';
import { ScraperService } from './scraper.service';

@ApiTags('scraper')
@Controller('artists')
export class ScraperController {
  constructor(private readonly scraperService: ScraperService) {}

  @Post(':melonArtistId/scrape')
  @ApiOperation({ summary: '멜론 아티스트 정보/앨범/곡 스크래핑 후 저장' })
  scrapeArtist(
    @Param('melonArtistId', ParseIntPipe) melonArtistId: number,
  ): Promise<ScrapeArtistResultDto> {
    return this.scraperService.scrapeArtist(String(melonArtistId));
  }
}
