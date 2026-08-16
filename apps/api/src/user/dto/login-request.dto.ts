import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginRequestDto {
  @ApiProperty({ description: '로그인 아이디', example: 'songquiz01' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  loginId: string;

  @ApiProperty({ description: '비밀번호', example: 'songquiz1234' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  password: string;
}
