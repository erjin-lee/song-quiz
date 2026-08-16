import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class SignupRequestDto {
  @ApiProperty({
    description: '로그인 아이디',
    example: 'songquiz01',
    minLength: 4,
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(4)
  @MaxLength(100)
  loginId: string;

  @ApiProperty({
    description: '비밀번호',
    example: 'songquiz1234',
    minLength: 8,
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(255)
  password: string;

  @ApiProperty({ description: '닉네임', example: '노래왕', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nickNm: string;
}
