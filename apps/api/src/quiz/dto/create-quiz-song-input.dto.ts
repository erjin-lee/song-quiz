import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';

/** 곡 하나당 등록 가능한 정답 후보 수 상한(오남용 방지). */
export const MAX_ANSWERS_PER_SONG = 10;

export class CreateQuizSongInputDto {
  @ApiProperty({ description: '내부 곡 ID' })
  @IsString()
  @IsNotEmpty()
  songId: string;

  @ApiProperty({
    description:
      '즉시 검증(POST /songs/:songId/youtube-link/validate 또는 .../auto)을 통과한 videoId 기반 정규화 URL. ' +
      'videoId/재생 구간/영상 길이는 여기서 다시 받지 않고 서버가 이 URL을 재검증해서 직접 계산한다 - ' +
      '클라이언트가 URL과 다른 videoId/구간을 따로 보낼 수 있게 하면 검증한 영상과 실제 재생 영상이 달라질 수 있다.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  youtubeUrl: string;

  @ApiProperty({
    description: '정답 목록',
    type: [String],
    maxItems: MAX_ANSWERS_PER_SONG,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_ANSWERS_PER_SONG)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(300, { each: true })
  answers: string[];
}
