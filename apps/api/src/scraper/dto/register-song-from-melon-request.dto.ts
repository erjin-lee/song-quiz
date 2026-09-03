import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * GET /melon/songs/search 결과에서 곡 하나를 선택했을 때 melonSongId만 보낸다.
 * 곡명/앨범명/아티스트 같은 표시용 데이터는 클라이언트가 다시 보내지 않고,
 * 서버가 검색 시점에 캐시해둔 값만 신뢰한다(melon-song-search.service.ts) -
 * melonSongId 등이 SQ_SONG/SQ_ATST/SQ_ALBM의 unique 키라서, 클라이언트가
 * 보낸 이름을 그대로 믿으면 한 번 오염된 이름이 그 멜론 ID를 검색하는
 * 모든 유저에게 영구적으로 남는다.
 */
export class RegisterSongFromMelonRequestDto {
  @ApiProperty({ description: '멜론 곡 ID', example: '30244931' })
  @IsString()
  @IsNotEmpty()
  melonSongId: string;
}
