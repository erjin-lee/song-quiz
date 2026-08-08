import { ApiProperty } from '@nestjs/swagger';
import { RoomItemDto } from './room-item.dto';

export class RoomJoinResultDto {
  @ApiProperty({ description: '방 정보', type: RoomItemDto })
  room: RoomItemDto;

  @ApiProperty({
    description:
      '이번 요청으로 발급된 내 유저 ID. 이후 퇴장/소켓 연결 시 사용한다.',
    example: 'b3f1c2e0-1234-4a5b-9c6d-abcdef123456',
  })
  userId: string;
}
