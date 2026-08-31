import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminService } from '../admin/admin.service';
import { UserSlack } from '../user/entities/user-slack.entity';
import { postToSlackResponseUrl } from './post-to-slack-response-url';

interface SlackBlockAction {
  action_id: string;
  value?: string;
}

interface SlackBlockActionsPayload {
  type: string;
  team?: { id: string };
  user?: { id: string };
  actions?: SlackBlockAction[];
  response_url?: string;
}

interface InquiryActionButtonValue {
  inquiryId: string;
  action: 'APPROVE' | 'REJECT';
}

@Injectable()
export class SlackInteractionService {
  private readonly logger = new Logger(SlackInteractionService.name);

  constructor(
    @InjectRepository(UserSlack)
    private readonly userSlackRepository: Repository<UserSlack>,
    private readonly adminService: AdminService,
  ) {}

  /**
   * 문의 검토 알림의 승인/반려 버튼 클릭을 처리한다. Slack이 3초 내 200 응답을 요구하므로
   * 컨트롤러가 이 메서드를 fire-and-forget으로 호출한다 - 여기서 던지는 예외는 아무도
   * 받지 않으므로 어떤 경로로도 밖으로 던지지 않는다(전부 로깅 또는 response_url 회신으로
   * 갈음한다).
   */
  async handle(rawPayload: string): Promise<void> {
    try {
      const payload = JSON.parse(rawPayload) as SlackBlockActionsPayload;
      if (payload.type !== 'block_actions') {
        return;
      }

      const action = payload.actions?.[0];
      const slackTeamId = payload.team?.id;
      const slackUserId = payload.user?.id;
      if (!action?.value || !slackTeamId || !slackUserId) {
        this.logger.error(
          `Slack payload 형식이 올바르지 않습니다: ${rawPayload}`,
        );
        return;
      }

      const userSlack = await this.userSlackRepository.findOne({
        where: { slackTeamId, slackUserId, isActive: 'Y' },
      });
      if (!userSlack) {
        await this.replyIfPossible(payload.response_url, {
          text: '⚠️ 등록되지 않은 Slack 계정입니다. 관리자에게 등록을 요청해주세요.',
          response_type: 'ephemeral',
        });
        return;
      }

      const buttonValue = JSON.parse(action.value) as InquiryActionButtonValue;

      await this.approveOrReject(buttonValue, userSlack.userKey, payload);
    } catch (error) {
      this.logger.error('Slack 인터랙션 처리 중 예상치 못한 오류', error);
    }
  }

  private async approveOrReject(
    buttonValue: InquiryActionButtonValue,
    userKey: string,
    payload: SlackBlockActionsPayload,
  ): Promise<void> {
    const isApprove = buttonValue.action === 'APPROVE';
    try {
      if (isApprove) {
        await this.adminService.approveInquiry(buttonValue.inquiryId, userKey);
      } else {
        await this.adminService.rejectInquiry(buttonValue.inquiryId, userKey);
      }
      await this.replyIfPossible(payload.response_url, {
        text: `${isApprove ? '✅' : '❌'} <@${payload.user?.id}>님이 ${
          isApprove ? '승인' : '반려'
        }했습니다.`,
      });
    } catch (error) {
      this.logger.error(
        `Slack 인터랙션 처리 실패(inquiryId: ${buttonValue.inquiryId})`,
        error,
      );
      await this.replyIfPossible(payload.response_url, {
        text: `⚠️ 처리 실패: ${(error as Error).message}`,
        response_type: 'ephemeral',
      });
    }
  }

  private async replyIfPossible(
    responseUrl: string | undefined,
    body: { text: string; response_type?: 'ephemeral' | 'in_channel' },
  ): Promise<void> {
    if (!responseUrl) {
      return;
    }
    await postToSlackResponseUrl(responseUrl, body);
  }
}
