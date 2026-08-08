import { ApiProperty } from '@nestjs/swagger';

export class GenerateQuizResultDto {
  @ApiProperty({ description: '생성된 퀴즈 ID' })
  quizId: string;

  @ApiProperty({ description: '퀴즈 제목(아티스트명)' })
  quizTtl: string;

  @ApiProperty({ description: '퀴즈 설명' })
  quizDesc: string;

  @ApiProperty({ description: '대상 곡 수(유튜브 링크가 없던 곡)' })
  targetSongCount: number;

  @ApiProperty({ description: '퀴즈 출제곡으로 저장된 곡 수' })
  savedSongCount: number;

  @ApiProperty({ description: '유튜브 영상을 찾지 못해 제외된 곡 수' })
  skippedSongCount: number;
}
