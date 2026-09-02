import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class MelonArtistBriefDto {
  @ApiProperty({ description: '멜론 아티스트 ID', example: '672375' })
  @IsString()
  @IsNotEmpty()
  melonArtistId: string;

  @ApiProperty({ description: '아티스트명', example: '방탄소년단' })
  @IsString()
  @IsNotEmpty()
  atstNm: string;
}
