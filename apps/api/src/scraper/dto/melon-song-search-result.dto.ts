import { ApiProperty } from '@nestjs/swagger';
import { MelonArtistBriefDto } from './melon-artist-brief.dto';

export class MelonSongSearchResultDto {
  @ApiProperty({ description: '멜론 곡 ID', example: '30244931' })
  melonSongId: string;

  @ApiProperty({ description: '곡명', example: '봄날' })
  songNm: string;

  @ApiProperty({ description: '멜론 앨범 ID', example: '10037969' })
  melonAlbmId: string;

  @ApiProperty({ description: '앨범명', example: 'YOU NEVER WALK ALONE' })
  albmNm: string;

  @ApiProperty({ description: '아티스트 목록', type: [MelonArtistBriefDto] })
  artists: MelonArtistBriefDto[];

  @ApiProperty({
    description: '"곡명 - 가수명" 형태의 화면 표시용 라벨',
    example: '봄날 - 방탄소년단',
  })
  displayLabel: string;
}
