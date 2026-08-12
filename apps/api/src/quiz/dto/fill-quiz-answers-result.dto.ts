import { ApiProperty } from '@nestjs/swagger';

export class FillQuizAnswersResultDto {
  @ApiProperty({ description: '정답이 없어 채우기 대상이 된 출제곡 수' })
  targetSongCount: number;

  @ApiProperty({ description: '정답을 채운 출제곡 수' })
  savedSongCount: number;

  @ApiProperty({ description: '새로 저장된 정답 행 수(곡당 여러 개)' })
  savedAnswerCount: number;

  @ApiProperty({ description: 'GPT 응답 실패로 건너뛴 출제곡 수' })
  skippedSongCount: number;

  @ApiProperty({
    description: '다른 퀴즈의 동일한 곡에서 정답을 재사용한 출제곡 수',
  })
  reusedSongCount: number;

  @ApiProperty({ description: '다른 퀴즈의 동일한 곡에서 복사한 정답 수' })
  reusedAnswerCount: number;
}
