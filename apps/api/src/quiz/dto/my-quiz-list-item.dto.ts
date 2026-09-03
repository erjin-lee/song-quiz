import { ApiProperty } from '@nestjs/swagger';

export class MyQuizListItemDto {
  @ApiProperty({ description: '퀴즈 ID' })
  quizId: string;

  @ApiProperty({ description: '퀴즈 제목' })
  quizTtl: string;

  @ApiProperty({ description: '퀴즈 설명', nullable: true })
  quizDesc: string | null;

  @ApiProperty({ description: '출제곡 수' })
  songCount: number;

  @ApiProperty({ description: '플레이 횟수' })
  playCnt: number;

  @ApiProperty({ description: '등록 일시(ISO 8601)' })
  crtDt: string;
}
