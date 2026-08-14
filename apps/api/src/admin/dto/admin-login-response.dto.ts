import { ApiProperty } from '@nestjs/swagger';

export class AdminLoginResponseDto {
  @ApiProperty({ description: 'JWT 액세스 토큰' })
  accessToken: string;

  @ApiProperty({ description: '로그인 아이디', example: 'admin' })
  loginId: string;

  @ApiProperty({ description: '닉네임', example: '관리자' })
  nickNm: string;
}
