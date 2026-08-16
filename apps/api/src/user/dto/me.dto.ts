import { ApiProperty } from '@nestjs/swagger';

export class MeDto {
  @ApiProperty({ description: '유저 ID', example: 'a1b2c3d4-...' })
  userId: string;

  @ApiProperty({ description: '로그인 아이디', example: 'songquiz01' })
  loginId: string;

  @ApiProperty({ description: '닉네임', example: '노래왕' })
  nickNm: string;
}
