import { ApiProperty } from '@nestjs/swagger';
import {
  InquiryConfidence,
  InquiryFunctionName,
  InquiryStatus,
} from '../../inquiry/inquiry.types';

export class AdminInquiryItemDto {
  @ApiProperty({ description: '문의 ID', example: '1' })
  inquiryId: string;

  @ApiProperty({ description: '퀴즈 출제곡 ID', example: '1' })
  quizSongId: string;

  @ApiProperty({
    description: '노래명. 출제곡을 찾을 수 없으면 null',
    example: '바이, 썸머',
    nullable: true,
  })
  songNm: string | null;

  @ApiProperty({
    description: '아티스트명. 출제곡을 찾을 수 없으면 null',
    example: '아이유',
    nullable: true,
  })
  atstNm: string | null;

  @ApiProperty({
    description: '출제곡의 현재 유튜브 링크. 출제곡을 찾을 수 없으면 null',
    example: 'https://www.youtube.com/watch?v=pDvBiB1waBk&t=131',
    nullable: true,
  })
  youtubeUrl: string | null;

  @ApiProperty({ description: '방 ID', example: 'room-1' })
  roomId: string;

  @ApiProperty({ description: '문의를 남긴 유저 ID', example: 'user-1' })
  userId: string;

  @ApiProperty({ description: '문의 내용', example: '시작 지점이 너무 늦어요' })
  content: string;

  @ApiProperty({
    description: 'GPT가 판별한 조치 함수. 판별 실패 시 null',
    example: 'CHANGE_START_TIME',
    nullable: true,
  })
  matchedFunction: InquiryFunctionName | null;

  @ApiProperty({
    description: '판별된 조치 인자',
    example: { startSec: 120 },
    nullable: true,
  })
  matchedArgs: Record<string, unknown> | null;

  @ApiProperty({
    description: '조치 신뢰도',
    example: 'HIGH',
    nullable: true,
  })
  confidence: InquiryConfidence | null;

  @ApiProperty({ description: '처리 상태', example: 'COMPLETED' })
  status: InquiryStatus;

  @ApiProperty({
    description: '유저에게 전달된 결과 메시지',
    example: '요청하신 재생 시작 시간이 반영되었습니다.',
    nullable: true,
  })
  resultMessage: string | null;

  @ApiProperty({ description: '접수 시각' })
  crtDt: Date;
}
