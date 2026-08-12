import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdConfigDto } from './dto/ad-config.dto';
import { ConfigService } from './config.service';

@ApiTags('config')
@Controller('config')
export class ConfigController {
  constructor(private readonly configService: ConfigService) {}

  @Get('ads')
  @ApiOperation({ summary: '광고 노출 여부 조회' })
  @ApiOkResponse({ description: '광고 설정', type: AdConfigDto })
  getAdConfig(): AdConfigDto {
    return this.configService.getAdConfig();
  }
}
