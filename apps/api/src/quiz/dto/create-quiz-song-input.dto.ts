import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export type QuizSongLinkSource = 'MANUAL' | 'AUTO';

export class CreateQuizSongInputDto {
  @ApiProperty({ description: '내부 곡 ID' })
  @IsString()
  @IsNotEmpty()
  songId: string;

  @ApiProperty({
    description:
      '즉시 검증(POST /songs/:songId/youtube-link/validate 또는 .../auto)을 통과한 videoId 기반 정규화 URL',
  })
  @IsString()
  @IsNotEmpty()
  youtubeUrl: string;

  @ApiProperty({ description: '유튜브 영상 ID' })
  @IsString()
  @IsNotEmpty()
  youtubeVideoId: string;

  @ApiProperty({
    description:
      '링크 출처. MANUAL은 안전망 재검증에서 제목까지 다시 대조하고, AUTO는 형식/가용성만 재확인한다.',
    enum: ['MANUAL', 'AUTO'],
  })
  @IsIn(['MANUAL', 'AUTO'])
  linkSource: QuizSongLinkSource;

  @ApiProperty({ description: '재생 시작 지점(초)' })
  @IsInt()
  @Min(0)
  startSec: number;

  @ApiProperty({ description: '재생 종료 지점(초)' })
  @IsInt()
  @Min(1)
  endSec: number;

  @ApiProperty({
    description: '영상 길이(초)',
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  durationSec?: number | null;

  @ApiProperty({ description: '정답 목록', type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  answers: string[];
}
