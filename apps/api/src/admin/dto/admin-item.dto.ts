import { ApiProperty } from '@nestjs/swagger';

export class AdminItemDto {
  @ApiProperty({ description: '관리자 유저 ID', example: '3' })
  userId: string;

  @ApiProperty({ description: '로그인 아이디', example: 'admin2' })
  loginId: string;

  @ApiProperty({ description: '닉네임', example: '운영자2' })
  nickNm: string;

  @ApiProperty({ description: '계정 상태', example: 'ACTIVE' })
  status: string;

  @ApiProperty({ description: '마지막 로그인 일시', nullable: true })
  lastLoginDt: Date | null;

  @ApiProperty({ description: '생성일시' })
  crtDt: Date;
}
