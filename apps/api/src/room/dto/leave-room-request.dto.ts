import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class LeaveRoomRequestDto {
  @ApiProperty({
    description: '퇴장할 유저 ID(입장/생성 시 발급받은 값)',
    example: 'b3f1c2e0-1234-4a5b-9c6d-abcdef123456',
  })
  @IsUUID()
  userId: string;
}
