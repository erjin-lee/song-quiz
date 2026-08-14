import { ApiProperty } from '@nestjs/swagger';

export class CreateAdminResponseDto {
  @ApiProperty({ description: '관리자 유저 ID', example: '3' })
  userId: string;

  @ApiProperty({ description: '로그인 아이디', example: 'admin2' })
  loginId: string;

  @ApiProperty({ description: '닉네임', example: '운영자2' })
  nickNm: string;

  @ApiProperty({
    description:
      '자동 생성된 임시 비밀번호. 이 응답에서만 1회 노출되며 서버는 평문을 보관하지 않는다.',
    example: 'A1b2C3d4E5f6G7h8',
  })
  temporaryPassword: string;
}
