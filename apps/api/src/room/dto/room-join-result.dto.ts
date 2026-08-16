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

  @ApiProperty({
    description:
      '이 방 참가자 본인만 아는 비공개 접근 토큰. userId는 방 정보 조회로 누구나 ' +
      '알 수 있으므로, 소켓 room:enter와 퇴장 요청에서 본인 확인용으로 반드시 ' +
      '이 토큰을 함께 보내야 한다. 절대 다른 사람에게 노출/공유하지 않는다.',
    example: 'c4d2e3f1-...',
  })
  accessToken: string;
}
