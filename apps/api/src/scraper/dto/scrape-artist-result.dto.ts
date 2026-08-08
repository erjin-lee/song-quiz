import { ApiProperty } from '@nestjs/swagger';

export class ScrapeArtistResultDto {
  @ApiProperty({ description: '아티스트 ID' })
  atstId: string;

  @ApiProperty({ description: '멜론 아티스트 ID' })
  melonAtstId: string;

  @ApiProperty({ description: '아티스트명' })
  atstNm: string;

  @ApiProperty({ description: '저장된 앨범 수(단독 발매만)' })
  savedAlbumCount: number;

  @ApiProperty({ description: '단독 발매가 아니어서 제외된 앨범 수' })
  skippedAlbumCount: number;

  @ApiProperty({ description: '저장된 곡 수' })
  savedSongCount: number;

  @ApiProperty({ description: '소속 앨범이 저장되지 않아 제외된 곡 수' })
  skippedSongCount: number;
}
