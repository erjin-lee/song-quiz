import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CreateQuizSongInputDto } from './create-quiz-song-input.dto';
import { MIN_USER_QUIZ_SONG_COUNT } from '../quiz.constants';

export class CreateQuizRequestDto {
  @ApiProperty({ description: '퀴즈 제목', example: '내가 만든 퀴즈' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  quizTtl: string;

  @ApiProperty({ description: '퀴즈 설명', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  quizDesc?: string;

  @ApiProperty({
    description: `출제곡 목록(최소 ${MIN_USER_QUIZ_SONG_COUNT}곡)`,
    type: [CreateQuizSongInputDto],
  })
  @IsArray()
  @ArrayMinSize(MIN_USER_QUIZ_SONG_COUNT)
  @ValidateNested({ each: true })
  @Type(() => CreateQuizSongInputDto)
  songs: CreateQuizSongInputDto[];
}
