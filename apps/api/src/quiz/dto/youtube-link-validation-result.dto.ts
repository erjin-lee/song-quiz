import { ApiProperty } from '@nestjs/swagger';

export class YoutubeLinkValidationResultDto {
  @ApiProperty({ description: '검증 통과 여부' })
  valid: boolean;

  @ApiProperty({
    description: 'videoId 기반으로 정규화한 URL(통과 시에만 값이 있음)',
    nullable: true,
  })
  youtubeUrl: string | null;

  @ApiProperty({ description: '유튜브 영상 ID', nullable: true })
  youtubeVideoId: string | null;

  @ApiProperty({ description: '영상 길이(초)', nullable: true })
  durationSec: number | null;

  @ApiProperty({ description: '재생 시작 지점(초)', nullable: true })
  startSec: number | null;

  @ApiProperty({ description: '재생 종료 지점(초)', nullable: true })
  endSec: number | null;

  @ApiProperty({
    description: '검증 실패 사유(통과 시 null)',
    nullable: true,
  })
  reason: string | null;
}
