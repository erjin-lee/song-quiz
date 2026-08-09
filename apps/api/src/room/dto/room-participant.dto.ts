import { ApiProperty } from '@nestjs/swagger';

export class RoomParticipantDto {
  @ApiProperty({
    description: '참가자 유저 ID(서버 발급 UUID)',
    example: 'b3f1c2e0-1234-4a5b-9c6d-abcdef123456',
  })
  userId: string;

  @ApiProperty({ description: '닉네임', example: '홍길동' })
  nickname: string;

  @ApiProperty({ description: '누적 점수', example: 0 })
  score: number;
}
