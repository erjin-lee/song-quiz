import { ApiProperty } from '@nestjs/swagger';
import { RoomItemDto } from './room-item.dto';

export class LeaveRoomResultDto {
  @ApiProperty({
    description: '퇴장으로 방이 삭제되었는지 여부(마지막 참가자였던 경우 true)',
    example: false,
  })
  roomDeleted: boolean;

  @ApiProperty({
    description: '남은 방 정보(방이 삭제된 경우 없음)',
    type: RoomItemDto,
    required: false,
  })
  room?: RoomItemDto;
}
