import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ValidateYoutubeLinkRequestDto {
  @ApiProperty({
    description: '유저가 입력한 유튜브 링크',
    example: 'https://www.youtube.com/watch?v=abcd1234',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  youtubeUrl: string;
}
