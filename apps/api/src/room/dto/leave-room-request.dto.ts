import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class LeaveRoomRequestDto {
  @ApiProperty({
    description: '퇴장할 유저 ID(입장/생성 시 발급받은 값)',
    example: 'b3f1c2e0-1234-4a5b-9c6d-abcdef123456',
  })
  @IsUUID()
  userId: string;

  @ApiProperty({
    description: '입장/생성 시 함께 발급받은 비공개 접근 토큰(본인 확인용)',
    example: 'c4d2e3f1-...',
  })
  @IsString()
  @IsNotEmpty()
  accessToken: string;
}
