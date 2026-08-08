import { ApiProperty } from '@nestjs/swagger';

export class QuizListItemDto {
  @ApiProperty({ description: '퀴즈 ID', example: '3' })
  quizId: string;

  @ApiProperty({ description: '퀴즈 제목(아티스트명)', example: '아이유' })
  quizTtl: string;

  @ApiProperty({
    description: '퀴즈 설명',
    example: '아이유 - 노래 맞추기',
    nullable: true,
  })
  quizDesc: string | null;

  @ApiProperty({
    description: '퀴즈 썸네일 이미지 URL. 등록되지 않은 경우 null',
    example: null,
    nullable: true,
  })
  thumbImgUrl: string | null;

  @ApiProperty({ description: '플레이 횟수', example: 0 })
  playCnt: number;
}
