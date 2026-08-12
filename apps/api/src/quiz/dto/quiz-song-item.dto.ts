import { ApiProperty } from '@nestjs/swagger';
import { QuizAnswerItemDto } from './quiz-answer-item.dto';

export class QuizSongItemDto {
  @ApiProperty({ description: '퀴즈 출제곡 ID', example: '1' })
  quizSongId: string;

  @ApiProperty({ description: '출제 순서(1부터 시작)', example: 1 })
  quizSeq: number;

  @ApiProperty({ description: '노래 ID', example: '1' })
  songId: string;

  @ApiProperty({ description: '노래명', example: '바이, 썸머' })
  songNm: string;

  @ApiProperty({ description: '아티스트명', example: '아이유' })
  atstNm: string;

  @ApiProperty({ description: '앨범명', example: '바이, 썸머' })
  albmNm: string;

  @ApiProperty({
    description:
      '유튜브 URL. 재생 시작 지점(t 파라미터)이 포함되어 있으며, 실제 저장된 ' +
      '시작 지점(startSec)보다 1초 앞당겨서 내려준다.',
    example: 'https://www.youtube.com/watch?v=pDvBiB1waBk&t=131',
  })
  youtubeUrl: string;

  @ApiProperty({
    description: '유튜브 영상 ID(11자리). 검색 결과가 없으면 null',
    example: 'pDvBiB1waBk',
    nullable: true,
  })
  youtubeVideoId: string | null;

  @ApiProperty({
    description: '퀴즈용 재생 시작 위치(초). 기본값 0',
    example: 132,
    nullable: true,
  })
  startSec: number | null;

  @ApiProperty({
    description: '퀴즈용 재생 종료 위치(초). null이면 별도 종료 시점 없음',
    example: 162,
    nullable: true,
  })
  endSec: number | null;

  @ApiProperty({
    description: '허용 정답 목록',
    type: QuizAnswerItemDto,
    isArray: true,
  })
  answers: QuizAnswerItemDto[];
}
