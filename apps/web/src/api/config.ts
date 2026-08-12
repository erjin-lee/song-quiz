import { apiGet } from './client';
import type { AdConfigDto } from '../types/config';

export function getAdConfig(): Promise<AdConfigDto> {
  return apiGet<AdConfigDto>('/config/ads');
}
