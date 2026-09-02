import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsString,
  ValidateNested,
} from 'class-validator';
import { MelonArtistBriefDto } from './melon-artist-brief.dto';

/**
 * 유저가 GET /melon/songs/search 결과에서 곡 하나를 선택했을 때 그대로
 * 돌려보내는 값. 서버는 melonSongId/melonArtistId/melonAlbmId 기준으로
 * 항상 멱등하게 조회-또는-생성하므로, 여기 담긴 표시용 텍스트(songNm 등)가
 * 조작되어도 검색 결과 자체와 다른 위험한 동작으로 이어지지 않는다.
 */
export class RegisterSongFromMelonRequestDto {
  @ApiProperty({ description: '멜론 곡 ID', example: '30244931' })
  @IsString()
  @IsNotEmpty()
  melonSongId: string;

  @ApiProperty({ description: '곡명', example: '봄날' })
  @IsString()
  @IsNotEmpty()
  songNm: string;

  @ApiProperty({ description: '멜론 앨범 ID', example: '10037969' })
  @IsString()
  @IsNotEmpty()
  melonAlbmId: string;

  @ApiProperty({ description: '앨범명', example: 'YOU NEVER WALK ALONE' })
  @IsString()
  @IsNotEmpty()
  albmNm: string;

  @ApiProperty({ description: '아티스트 목록', type: [MelonArtistBriefDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MelonArtistBriefDto)
  artists: MelonArtistBriefDto[];
}
