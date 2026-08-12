import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { FillQuizAnswersResultDto } from './dto/fill-quiz-answers-result.dto';
import { FillQuizYoutubeLinksResultDto } from './dto/fill-quiz-youtube-links-result.dto';
import { GenerateQuizResultDto } from './dto/generate-quiz-result.dto';
import {
  GetQuizzesQueryDto,
  QuizSearchType,
} from './dto/get-quizzes-query.dto';
import { QuizListItemDto } from './dto/quiz-list-item.dto';
import { QuizSongCountDto } from './dto/quiz-song-count.dto';
import { QuizSongItemDto } from './dto/quiz-song-item.dto';
import { QuizAnswerGeneratorService } from './quiz-answer-generator.service';
import { QuizGeneratorService } from './quiz-generator.service';
import { QuizService } from './quiz.service';

@ApiTags('quiz')
@Controller('quizzes')
export class QuizController {
  constructor(
    private readonly quizService: QuizService,
    private readonly quizGeneratorService: QuizGeneratorService,
    private readonly quizAnswerGeneratorService: QuizAnswerGeneratorService,
  ) {}

  @Get()
  @ApiOperation({ summary: '퀴즈 리스트 조회(키워드 검색 가능)' })
  @ApiQuery({
    name: 'keyword',
    required: false,
    description: '검색 키워드',
    example: '아이유',
  })
  @ApiQuery({
    name: 'searchType',
    required: false,
    enum: QuizSearchType,
    description: '검색 대상 (기본값 ALL)',
  })
  @ApiOkResponse({
    description: '퀴즈 리스트',
    type: QuizListItemDto,
    isArray: true,
  })
  getQuizzes(@Query() query: GetQuizzesQueryDto): Promise<QuizListItemDto[]> {
    return this.quizService.getQuizzes(query);
  }

  @Get(':quizId/songs/count')
  @ApiOperation({
    summary: '퀴즈별 출제곡 개수 조회(정답 등 스포일러 필드는 포함하지 않음)',
  })
  @ApiParam({ name: 'quizId', description: '퀴즈 ID', type: Number })
  @ApiOkResponse({ description: '퀴즈 출제곡 개수', type: QuizSongCountDto })
  @ApiNotFoundResponse({ description: '퀴즈를 찾을 수 없음' })
  async getQuizSongCount(
    @Param('quizId', ParseIntPipe) quizId: number,
  ): Promise<QuizSongCountDto> {
    const count = await this.quizService.getQuizSongCount(String(quizId));
    return { count };
  }

  @Get(':quizId/songs')
  @ApiOperation({ summary: '퀴즈별 출제곡 리스트 조회' })
  @ApiParam({ name: 'quizId', description: '퀴즈 ID', type: Number })
  @ApiOkResponse({
    description: '퀴즈 출제곡 리스트',
    type: QuizSongItemDto,
    isArray: true,
  })
  @ApiNotFoundResponse({ description: '퀴즈를 찾을 수 없음' })
  getQuizSongs(
    @Param('quizId', ParseIntPipe) quizId: number,
  ): Promise<QuizSongItemDto[]> {
    return this.quizService.getQuizSongs(String(quizId));
  }

  @Post('generate/:atstId')
  @ApiOperation({ summary: '아티스트의 미연동 곡으로 퀴즈 생성(유튜브 검색)' })
  generateQuiz(
    @Param('atstId', ParseIntPipe) atstId: number,
  ): Promise<GenerateQuizResultDto> {
    return this.quizGeneratorService.generateQuiz(String(atstId));
  }

  @Post(':quizId/youtube-links')
  @ApiOperation({
    summary: '퀴즈 출제곡 중 유튜브 링크가 없는 곡에 유튜브 정보 채우기',
  })
  @ApiParam({ name: 'quizId', description: '퀴즈 ID', type: Number })
  @ApiNotFoundResponse({ description: '퀴즈를 찾을 수 없음' })
  fillYoutubeLinks(
    @Param('quizId', ParseIntPipe) quizId: number,
  ): Promise<FillQuizYoutubeLinksResultDto> {
    return this.quizGeneratorService.fillYoutubeLinks(String(quizId));
  }

  @Post('answers/fill')
  @ApiOperation({
    summary: '정답이 없고 유튜브 링크는 있는 전체 출제곡에 GPT로 정답 채우기',
  })
  fillAnswers(): Promise<FillQuizAnswersResultDto> {
    return this.quizAnswerGeneratorService.fillAnswers();
  }
}
