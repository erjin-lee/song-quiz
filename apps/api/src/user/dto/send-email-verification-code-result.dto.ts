import { ApiProperty } from '@nestjs/swagger';

export class SendEmailVerificationCodeResultDto {
  @ApiProperty({ description: '인증번호 유효 시간(분)', example: 5 })
  expiresInMinutes: number;
}
