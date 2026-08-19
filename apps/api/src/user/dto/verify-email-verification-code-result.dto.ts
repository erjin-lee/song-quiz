import { ApiProperty } from '@nestjs/swagger';

export class VerifyEmailVerificationCodeResultDto {
  @ApiProperty({ description: '인증 성공 여부', example: true })
  verified: boolean;
}
