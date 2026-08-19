import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Matches } from 'class-validator';

export class VerifyEmailVerificationCodeRequestDto {
  @ApiProperty({
    description: '인증 대상 이메일',
    example: 'user@example.com',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: '이메일로 받은 6자리 인증번호',
    example: '482913',
  })
  @IsString()
  @Matches(/^\d{6}$/, { message: '인증번호는 숫자 6자리여야 합니다.' })
  code: string;
}
