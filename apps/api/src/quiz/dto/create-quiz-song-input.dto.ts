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

  @ApiProperty({
    description:
      '.../youtube-link/validate 또는 .../auto 응답의 verificationToken을 그대로 실어 보내야 한다. ' +
      '이 songId/videoId 조합에 대해 서버가 즉시 검증을 통과시켰다는 증명이며, 없거나 서명·songId/videoId가 ' +
      '안 맞거나 만료됐으면 등록 자체가 거부된다(즉시 검증 API를 거치지 않고 형식만 맞는 URL을 바로 제출하는 ' +
      '우회를 막기 위함). 토큰 출처가 AUTO(자동 검색)일 때만 안전망 재검증에서 제목 매칭을 생략한다(spec.md 3.3-③) - ' +
      'MANUAL(직접 입력) 출처는 안전망이 항상 콘텐츠 검증까지 다시 수행한다.',
  })
  @IsString()
  @IsNotEmpty()
  verificationToken: string;
}
