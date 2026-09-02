import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UserAuthGuard } from '../user/guards/user-auth.guard';
import { AnswerCandidatesDto } from './dto/answer-candidates.dto';
import { ValidateYoutubeLinkRequestDto } from './dto/validate-youtube-link-request.dto';
import { YoutubeLinkValidationResultDto } from './dto/youtube-link-validation-result.dto';
import { UserSongService } from './user-song.service';

@ApiTags('user-song')
@Controller('songs')
@UseGuards(UserAuthGuard)
@ApiUnauthorizedResponse({ description: '인증 토큰이 없거나 유효하지 않음' })
export class UserSongController {
  constructor(private readonly userSongService: UserSongService) {}

  @Post(':songId/youtube-link/validate')
  @ApiOperation({ summary: '유저가 입력한 유튜브 링크 즉시 검증' })
  @ApiOkResponse({ type: YoutubeLinkValidationResultDto })
  @ApiNotFoundResponse({ description: '곡을 찾을 수 없음' })
  validateYoutubeLink(
    @Param('songId', ParseIntPipe) songId: number,
    @Body() dto: ValidateYoutubeLinkRequestDto,
  ): Promise<YoutubeLinkValidationResultDto> {
    return this.userSongService.validateYoutubeLink(
      String(songId),
      dto.youtubeUrl,
    );
  }

  @Post(':songId/youtube-link/auto')
  @ApiOperation({
    summary: '링크가 공란인 곡에 대해 자동으로 유튜브 링크를 찾음',
  })
  @ApiOkResponse({ type: YoutubeLinkValidationResultDto })
  @ApiNotFoundResponse({ description: '곡을 찾을 수 없음' })
  autoFillYoutubeLink(
    @Param('songId', ParseIntPipe) songId: number,
  ): Promise<YoutubeLinkValidationResultDto> {
    return this.userSongService.autoFillYoutubeLink(String(songId));
  }

  @Get(':songId/answers')
  @ApiOperation({
    summary: '정답 후보 조회(기존 정답 재사용 또는 규칙 기반 생성)',
  })
  @ApiOkResponse({ type: AnswerCandidatesDto })
  @ApiNotFoundResponse({ description: '곡을 찾을 수 없음' })
  async getAnswerCandidates(
    @Param('songId', ParseIntPipe) songId: number,
  ): Promise<AnswerCandidatesDto> {
    const answers = await this.userSongService.getAnswerCandidates(
      String(songId),
    );
    return { answers };
  }
}
