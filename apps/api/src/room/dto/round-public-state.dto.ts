import { ApiProperty } from '@nestjs/swagger';

export class RoundPublicStateDto {
  @ApiProperty({ description: '라운드 순번(0부터 시작)', example: 0 })
  roundIndex: number;

  @ApiProperty({ description: '전체 라운드 수', example: 10 })
  totalRounds: number;

  @ApiProperty({
    description: '유튜브 영상 ID. 정답 유출 방지를 위해 곡 정보는 공개 전까지 숨긴다.',
    example: 'pDvBiB1waBk',
    nullable: true,
  })
  youtubeVideoId: string | null;

  @ApiProperty({ description: '재생 시작 위치(초)', example: 132, nullable: true })
  startSec: number | null;

  @ApiProperty({ description: '재생 종료 위치(초)', example: 162, nullable: true })
  endSec: number | null;

  @ApiProperty({
    description: '영상 로딩(재생 준비) 완료를 알린 유저 ID 목록',
    example: [],
    type: [String],
  })
  readyUserIds: string[];

  @ApiProperty({
    description: '이번 라운드에서 정답을 맞춘 순서대로의 유저 ID 목록',
    example: [],
    type: [String],
  })
  correctUserIds: string[];

  @ApiProperty({
    description: '이번 라운드 스킵을 요청한 유저 ID 목록(과반이면 라운드가 종료된다)',
    example: [],
    type: [String],
  })
  skipUserIds: string[];

  @ApiProperty({
    description: '방장이 재생을 시작한 시각(ISO). 아직 시작 전이면 null',
    example: null,
    nullable: true,
  })
  playStartedAt: string | null;

  @ApiProperty({
    description: '라운드 종료(정답 공개) 여부',
    example: false,
  })
  revealed: boolean;

  @ApiProperty({
    description: '정답 공개 전에는 null, 라운드 종료 후 노래명 공개',
    example: null,
    nullable: true,
  })
  songNm: string | null;

  @ApiProperty({
    description: '정답 공개 전에는 null, 라운드 종료 후 아티스트명 공개',
    example: null,
    nullable: true,
  })
  atstNm: string | null;

  @ApiProperty({
    description: '정답 공개 전에는 null, 라운드 종료 후 앨범명 공개',
    example: null,
    nullable: true,
  })
  albmNm: string | null;
}
