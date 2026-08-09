import { ApiProperty } from '@nestjs/swagger';
import { RoomParticipantDto } from './room-participant.dto';
import { RoundPublicStateDto } from './round-public-state.dto';

export type GameStatus =
  | 'WAITING'
  | 'LOADING'
  | 'READY_TO_PLAY'
  | 'PLAYING'
  | 'ROUND_ENDED'
  | 'FINISHED';

export class RoomItemDto {
  @ApiProperty({
    description: '방 ID(UUID)',
    example: 'a1b2c3d4-1234-4a5b-9c6d-abcdef123456',
  })
  roomId: string;

  @ApiProperty({ description: '방 제목', example: '아이유 노래 맞추기 방' })
  roomTtl: string;

  @ApiProperty({ description: '퀴즈 ID', example: '1' })
  quizId: string;

  @ApiProperty({ description: '퀴즈 제목', example: '아이유' })
  quizTtl: string;

  @ApiProperty({
    description: '퀴즈에 연결된 아티스트 ID 목록(없으면 빈 배열)',
    example: ['1'],
    type: [String],
  })
  atstIds: string[];

  @ApiProperty({
    description: '퀴즈에 연결된 아티스트명 목록(없으면 빈 배열)',
    example: ['아이유'],
    type: [String],
  })
  atstNms: string[];

  @ApiProperty({ description: '출제곡 랜덤 여부', example: false })
  isRandom: boolean;

  @ApiProperty({ description: '최대 인원', example: 8 })
  maxUserCnt: number;

  @ApiProperty({ description: '현재 인원', example: 1 })
  curUserCnt: number;

  @ApiProperty({
    description: '방장 유저 ID',
    example: 'b3f1c2e0-1234-4a5b-9c6d-abcdef123456',
  })
  hostUserId: string;

  @ApiProperty({
    description: '현재 참가자 목록',
    type: RoomParticipantDto,
    isArray: true,
  })
  participants: RoomParticipantDto[];

  @ApiProperty({
    description: '방 생성일시(ISO)',
    example: '2026-08-09T08:00:00.000Z',
  })
  crtDt: string;

  @ApiProperty({
    description:
      '게임 진행 상태: WAITING(시작 전)/LOADING(라운드 준비, 영상 로딩 대기)/READY_TO_PLAY(전원 로딩 완료, 방장 시작 대기)/PLAYING(재생 중)/ROUND_ENDED(라운드 종료, 다음 라운드 대기)/FINISHED(게임 종료)',
    example: 'WAITING',
  })
  gameStatus: GameStatus;

  @ApiProperty({
    description: '현재 라운드 정보. 게임 시작 전(WAITING)에는 null',
    type: RoundPublicStateDto,
    nullable: true,
  })
  currentRound: RoundPublicStateDto | null;
}
