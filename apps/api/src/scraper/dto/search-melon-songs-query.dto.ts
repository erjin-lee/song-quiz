import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SearchMelonSongsQueryDto {
  @ApiProperty({ description: '검색 키워드(곡명/아티스트명)', example: '봄날' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  keyword: string;
}
