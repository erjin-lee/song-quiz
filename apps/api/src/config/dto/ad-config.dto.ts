import { ApiProperty } from '@nestjs/swagger';

export class AdConfigDto {
  @ApiProperty({
    description:
      '광고 노출 여부. false면 클라이언트는 광고 대기 없이 즉시 방 생성/입장을 진행해야 한다.',
    example: true,
  })
  adEnabled: boolean;
}
