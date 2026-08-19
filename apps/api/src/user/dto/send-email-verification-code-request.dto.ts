import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class SendEmailVerificationCodeRequestDto {
  @ApiProperty({
    description: '인증번호를 받을 이메일',
    example: 'user@example.com',
  })
  @IsEmail()
  email: string;
}
