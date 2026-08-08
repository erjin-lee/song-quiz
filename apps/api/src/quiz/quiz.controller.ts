import { Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { GenerateQuizResultDto } from './dto/generate-quiz-result.dto';
import { QuizListItemDto } from './dto/quiz-list-item.dto';
import { QuizSongItemDto } from './dto/quiz-song-item.dto';
import { QuizGeneratorService } from './quiz-generator.service';
import { QuizService } from './quiz.service';

@ApiTags('quiz')
@Controller('quizzes')
export class QuizController {
  constructor(
    private readonly quizService: QuizService,
    private readonly quizGeneratorService: QuizGeneratorService,
  ) {}

  @Get()
  @ApiOperation({ summary: '퀴즈 리스트 조회' })
  @ApiOkResponse({ description: '퀴즈 리스트', type: QuizListItemDto, isArray: true })
  getQuizzes(): Promise<QuizListItemDto[]> {
    return this.quizService.getQuizzes();
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
}
