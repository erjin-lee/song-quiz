import { ApiProperty } from '@nestjs/swagger';

export class RegisteredSongDto {
  @ApiProperty({ description: '내부 곡 ID(이후 링크 검증/정답 조회에 사용)' })
  songId: string;

  @ApiProperty({ description: '곡명' })
  songNm: string;

  @ApiProperty({
    description: '곡 마스터에 이미 등록된 기본 유튜브 링크(없으면 null)',
    nullable: true,
  })
  ytbLink: string | null;
}
