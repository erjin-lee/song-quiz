import { ApiProperty } from '@nestjs/swagger';

export class AnswerCandidatesDto {
  @ApiProperty({
    description: '정답 후보(기존 정답이 있으면 그것, 없으면 규칙 기반 생성)',
    type: [String],
  })
  answers: string[];
}
