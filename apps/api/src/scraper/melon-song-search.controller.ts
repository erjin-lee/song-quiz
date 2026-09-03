import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UserAuthGuard } from '../user/guards/user-auth.guard';
import { MelonSongSearchResultDto } from './dto/melon-song-search-result.dto';
import { RegisterSongFromMelonRequestDto } from './dto/register-song-from-melon-request.dto';
import { RegisteredSongDto } from './dto/registered-song.dto';
import { SearchMelonSongsQueryDto } from './dto/search-melon-songs-query.dto';
import { MelonSongSearchService } from './melon-song-search.service';

@ApiTags('melon-song-search')
@Controller()
@UseGuards(UserAuthGuard)
@ApiUnauthorizedResponse({ description: '인증 토큰이 없거나 유효하지 않음' })
export class MelonSongSearchController {
  constructor(
    private readonly melonSongSearchService: MelonSongSearchService,
  ) {}

  @Get('melon/songs/search')
  @ApiOperation({ summary: '멜론 곡 검색(상위 10건)' })
  @ApiOkResponse({ type: MelonSongSearchResultDto, isArray: true })
  search(
    @Query() query: SearchMelonSongsQueryDto,
  ): Promise<MelonSongSearchResultDto[]> {
    return this.melonSongSearchService.search(query.keyword);
  }

  @Post('songs/from-melon')
  @ApiOperation({
    summary:
      '검색 결과 선택 시 곡/아티스트/앨범을 멱등하게 저장(검색 시 캐시해둔 데이터만 신뢰)',
  })
  @ApiOkResponse({ type: RegisteredSongDto })
  async registerFromMelon(
    @Body() dto: RegisterSongFromMelonRequestDto,
  ): Promise<RegisteredSongDto> {
    const song = await this.melonSongSearchService.registerFromMelonSongId(
      dto.melonSongId,
    );
    return { songId: song.songId, songNm: song.songNm, ytbLink: song.ytbLink };
  }
}
