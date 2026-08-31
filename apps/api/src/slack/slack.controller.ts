import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SlackInteractionService } from './slack-interaction.service';
import { SlackSignatureGuard } from './slack-signature.guard';

/**
 * Slack 앱의 Interactivity Request URL. Swagger 문서에는 노출하지 않는다(외부
 * 서비스 전용 콜백 엔드포인트라 API 소비자에게 의미가 없다 - InternalAuthGuard가
 * 지키는 /internal/* 도 동일하게 문서에서 제외되어 있다).
 */
@ApiExcludeController()
@Controller('slack')
export class SlackController {
  private readonly logger = new Logger(SlackController.name);

  constructor(
    private readonly slackInteractionService: SlackInteractionService,
  ) {}

  @Post('interactions')
  @UseGuards(SlackSignatureGuard)
  @HttpCode(HttpStatus.OK)
  handleInteraction(@Body('payload') rawPayload: string): void {
    // Slack은 인터랙션 요청에 3초 안에 200 응답을 요구한다 - 실제 승인/반려는
    // 백그라운드로 처리하고 결과는 response_url로 회신한다(InquiryService.submit이
    // process()를 fire-and-forget하는 것과 동일 패턴).
    void this.slackInteractionService
      .handle(rawPayload)
      .catch((error: unknown) => {
        this.logger.error('Slack 인터랙션 처리 실패', error);
      });
  }
}
