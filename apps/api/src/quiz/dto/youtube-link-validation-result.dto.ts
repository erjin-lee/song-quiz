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

  @ApiProperty({
    description:
      '이 songId+videoId 조합을 서버가 확인했음을 증명하는 서명 토큰(통과 시에만 값이 있음). ' +
      '최종 등록 요청(POST/PATCH /quizzes)의 같은 곡 입력에 그대로 실어 보내야 한다.',
    nullable: true,
  })
  verificationToken: string | null;
}
