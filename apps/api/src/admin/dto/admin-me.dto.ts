import { ApiProperty } from '@nestjs/swagger';

export class AdminMeDto {
  @ApiProperty({ description: '관리자 유저 ID', example: '1' })
  userId: string;

  @ApiProperty({ description: '로그인 아이디', example: 'admin' })
  loginId: string;

  @ApiProperty({ description: '닉네임', example: '관리자' })
  nickNm: string;
}
