import { Injectable } from '@nestjs/common';
import { AdConfigDto } from './dto/ad-config.dto';

@Injectable()
export class ConfigService {
  getAdConfig(): AdConfigDto {
    return { adEnabled: process.env.AD_ENABLED?.trim() === 'true' };
  }
}
