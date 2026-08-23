import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InternalAuthGuard } from '../../common/internal-auth.guard';
import { QuizRoundDataDto } from './dto/quiz-round-data.dto';
import { QuizSummaryDto } from './dto/quiz-summary.dto';
import { QuizInternalService } from './quiz-internal.service';

/** apps/game 전용 내부 엔드포인트. apps/game은 Quiz Repository/Entity를 직접 참조하지 않는다. */
@Controller('internal/quizzes')
@UseGuards(InternalAuthGuard)
export class QuizInternalController {
  constructor(private readonly quizInternalService: QuizInternalService) {}

  @Get(':quizId/summary')
  getSummary(@Param('quizId') quizId: string): Promise<QuizSummaryDto> {
    return this.quizInternalService.getSummary(quizId);
  }

  @Post(':quizId/play-count/increment')
  @HttpCode(HttpStatus.NO_CONTENT)
  async incrementPlayCount(@Param('quizId') quizId: string): Promise<void> {
    await this.quizInternalService.incrementPlayCount(quizId);
  }

  @Get(':quizId/rounds')
  getQuizRounds(@Param('quizId') quizId: string): Promise<QuizRoundDataDto[]> {
    return this.quizInternalService.getQuizRounds(quizId);
  }
}
