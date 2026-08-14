import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateAdminRequestDto {
  @ApiProperty({
    description: '로그인 아이디',
    example: 'admin2',
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  loginId: string;

  @ApiProperty({ description: '닉네임', example: '운영자2', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nickNm: string;
}
