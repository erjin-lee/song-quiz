import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export enum QuizSearchType {
  ALL = 'ALL',
  TITLE = 'TITLE',
  ARTIST = 'ARTIST',
}

export class GetQuizzesQueryDto {
  @ApiPropertyOptional({ description: '검색 키워드', example: '아이유' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({
    description: '검색 대상 (ALL: 전체, TITLE: 퀴즈명, ARTIST: 아티스트명)',
    enum: QuizSearchType,
    default: QuizSearchType.ALL,
  })
  @IsOptional()
  @IsEnum(QuizSearchType)
  searchType?: QuizSearchType;
}
