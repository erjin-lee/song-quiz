import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  UserAuthenticatedRequest,
  UserAuthGuard,
} from '../user/guards/user-auth.guard';
import { CreateQuizRequestDto } from './dto/create-quiz-request.dto';
import { CreateQuizResultDto } from './dto/create-quiz-result.dto';
import { RegistrationEligibilityDto } from './dto/registration-eligibility.dto';
import { UserQuizRegistrationService } from './user-quiz-registration.service';

@ApiTags('user-quiz-registration')
@Controller('quizzes')
@UseGuards(UserAuthGuard)
@ApiUnauthorizedResponse({ description: '인증 토큰이 없거나 유효하지 않음' })
export class UserQuizRegistrationController {
  constructor(
    private readonly userQuizRegistrationService: UserQuizRegistrationService,
  ) {}

  @Get('registration-eligibility')
  @ApiOperation({ summary: '24시간 등록 제한 상태 조회(안내용)' })
  @ApiOkResponse({ type: RegistrationEligibilityDto })
  getEligibility(
    @Req() req: UserAuthenticatedRequest,
  ): Promise<RegistrationEligibilityDto> {
    return this.userQuizRegistrationService.getEligibility(req.user.userId);
  }

  @Post()
  @ApiOperation({
    summary:
      '퀴즈 등록 신청(24시간 제한, 최소 5곡) - 즉시 응답하고 안전망 재검증은 백그라운드에서 진행',
  })
  @ApiOkResponse({ type: CreateQuizResultDto })
  @ApiTooManyRequestsResponse({ description: '24시간 등록 제한에 걸림' })
  createQuiz(
    @Req() req: UserAuthenticatedRequest,
    @Body() dto: CreateQuizRequestDto,
  ): Promise<CreateQuizResultDto> {
    return this.userQuizRegistrationService.createQuiz(req.user.userId, dto);
  }

  @Patch(':quizId')
  @ApiOperation({ summary: '본인 소유 퀴즈 수정(제목/설명/곡 구성 전체)' })
  @ApiOkResponse({ type: CreateQuizResultDto })
  @ApiForbiddenResponse({ description: '본인 소유 퀴즈가 아님' })
  @ApiNotFoundResponse({ description: '퀴즈를 찾을 수 없음' })
  updateQuiz(
    @Req() req: UserAuthenticatedRequest,
    @Param('quizId', ParseIntPipe) quizId: number,
    @Body() dto: CreateQuizRequestDto,
  ): Promise<CreateQuizResultDto> {
    return this.userQuizRegistrationService.updateQuiz(
      req.user.userId,
      String(quizId),
      dto,
    );
  }

  @Delete(':quizId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '본인 소유 퀴즈 soft delete' })
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ description: '본인 소유 퀴즈가 아님' })
  @ApiNotFoundResponse({ description: '퀴즈를 찾을 수 없음' })
  deleteQuiz(
    @Req() req: UserAuthenticatedRequest,
    @Param('quizId', ParseIntPipe) quizId: number,
  ): Promise<void> {
    return this.userQuizRegistrationService.deleteQuiz(
      req.user.userId,
      String(quizId),
    );
  }
}
