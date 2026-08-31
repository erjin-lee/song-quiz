import { ApiProperty } from '@nestjs/swagger';
import { ChartType } from '../melon-scraper.client';

export class ScrapeChartResultDto {
  @ApiProperty({
    enum: ChartType,
    description: '차트 타입 (AG: 연대별, YE: 연도별)',
  })
  type: ChartType;

  @ApiProperty({ description: '연도 (AG는 10년 단위, YE는 임의 연도)' })
  year: number;

  @ApiProperty({ description: '생성된 퀴즈 ID' })
  quizId: string;

  @ApiProperty({ description: '퀴즈 제목' })
  quizTtl: string;

  @ApiProperty({ description: '퀴즈 설명' })
  quizDesc: string;

  @ApiProperty({ description: '멜론 차트에서 스크래핑한 곡 수(2페이지 합계)' })
  chartSongCount: number;

  @ApiProperty({ description: '새로 저장된 아티스트 수' })
  savedArtistCount: number;

  @ApiProperty({ description: '새로 저장된 곡 수(멜론 곡 ID 기준 신규만)' })
  savedSongCount: number;

  @ApiProperty({ description: '이미 존재하여 저장을 건너뛴 곡 수' })
  skippedSongCount: number;

  @ApiProperty({ description: '아티스트 정보가 없어 건너뛴 곡 수' })
  skippedInvalidSongCount: number;

  @ApiProperty({ description: '퀴즈 출제곡으로 실제 저장된 수' })
  savedQuizSongCount: number;

  @ApiProperty({
    description: '다른 퀴즈의 동일한 곡에서 유튜브 정보를 재사용한 출제곡 수',
  })
  reusedYoutubeCount: number;

  @ApiProperty({
    description: '다른 퀴즈의 동일한 곡에서 복사한 정답 수',
  })
  reusedAnswerCount: number;
}
