import { ApiProperty } from '@nestjs/swagger';

export class DbSongSearchResultDto {
  @ApiProperty({ description: '내부 곡 ID' })
  songId: string;

  @ApiProperty({ description: '곡명' })
  songNm: string;

  @ApiProperty({ description: '대표 아티스트명' })
  atstNm: string;

  @ApiProperty({
    description: '"곡명 - 가수명" 형태의 화면 표시용 라벨',
    example: '봄날 - 방탄소년단',
  })
  displayLabel: string;

  @ApiProperty({
    description: '곡 마스터에 이미 등록된 기본 유튜브 링크(없으면 null)',
    nullable: true,
  })
  ytbLink: string | null;
}
