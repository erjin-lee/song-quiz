import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumberString,
  IsString,
  MaxLength,
} from 'class-validator';

export const INQUIRY_CONTENT_MAX_LENGTH = 300;

export class SubmitInquiryRequestDto {
  @ApiProperty({ description: '문의 대상 출제곡 ID', example: '574' })
  @IsNumberString()
  quizSongId: string;

  @ApiProperty({ description: '방 ID', example: 'room-abc123' })
  @IsString()
  @IsNotEmpty()
  roomId: string;

  @ApiProperty({ description: '제출자 유저 ID', example: 'user-abc123' })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({
    description: '문의 내용',
    example: '이 곡 시작 지점이 너무 늦게 나와요. 30초쯤으로 바꿔주세요.',
    maxLength: INQUIRY_CONTENT_MAX_LENGTH,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(INQUIRY_CONTENT_MAX_LENGTH)
  content: string;
}
