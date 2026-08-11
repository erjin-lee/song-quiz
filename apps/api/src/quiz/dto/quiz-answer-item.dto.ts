import { ApiProperty } from '@nestjs/swagger';

export class QuizAnswerItemDto {
  @ApiProperty({ description: '퀴즈 정답 ID', example: '1' })
  quizAnswerId: string;

  @ApiProperty({ description: '퀴즈 출제곡 ID', example: '1' })
  quizSongId: string;

  @ApiProperty({ description: '허용 정답', example: '바이 썸머' })
  answerTxt: string;
}
