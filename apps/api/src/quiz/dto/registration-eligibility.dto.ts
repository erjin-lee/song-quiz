import { ApiProperty } from '@nestjs/swagger';

export class RegistrationEligibilityDto {
  @ApiProperty({ description: '지금 등록 가능한지 여부' })
  eligible: boolean;

  @ApiProperty({
    description: '등록 가능해질 때까지 남은 시간(초, 가능하면 0)',
  })
  remainingSeconds: number;
}
