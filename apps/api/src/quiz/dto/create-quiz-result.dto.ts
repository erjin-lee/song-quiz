import { ApiProperty } from '@nestjs/swagger';

export class CreateQuizResultDto {
  @ApiProperty({ description: '생성된 퀴즈 ID' })
  quizId: string;
}
