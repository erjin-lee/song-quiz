import { ApiProperty } from '@nestjs/swagger';

export class FillQuizYoutubeLinksResultDto {
  @ApiProperty({ description: '대상 퀴즈 ID' })
  quizId: string;

  @ApiProperty({ description: '퀴즈 제목' })
  quizTtl: string;

  @ApiProperty({ description: '유튜브 링크가 없어 채우기 대상이 된 출제곡 수' })
  targetSongCount: number;

  @ApiProperty({ description: '유튜브 링크를 채운 출제곡 수' })
  savedSongCount: number;

  @ApiProperty({ description: '유튜브 영상을 찾지 못해 건너뛴 출제곡 수' })
  skippedSongCount: number;

  @ApiProperty({
    description: '다른 퀴즈의 동일한 곡에서 유튜브 정보를 재사용한 출제곡 수',
  })
  reusedYoutubeCount: number;

  @ApiProperty({
    description: '다른 퀴즈의 동일한 곡에서 복사한 정답 수',
  })
  reusedAnswerCount: number;
}
