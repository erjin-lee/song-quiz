import { ApiProperty } from '@nestjs/swagger';

export class QuizSongCountDto {
  @ApiProperty({ description: '퀴즈 출제곡 개수', example: 140 })
  count: number;
}
