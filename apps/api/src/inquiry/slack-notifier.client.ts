import { Injectable, Logger } from '@nestjs/common';

export interface SlackMessage {
  /** blocks를 렌더링하지 못하는 클라이언트(알림 미리보기 등)를 위한 fallback 텍스트 */
  text: string;
  blocks?: unknown[];
}

/**
 * 문의(Inquiry) 검토 필요 알림을 Slack Incoming Webhook으로 보내는 클라이언트.
 * GameNotifierClient와 동일하게 best-effort로 동작한다 - 핵심 상태(DB 저장, 유저 알림)는
 * 이미 끝난 뒤 부가로 보내는 알림이므로, 실패해도 던지지 않고 로깅만 한다.
 * SLACK_WEBHOOK_URL이 없으면(로컬 개발 등) 조용히 건너뛴다.
 */
@Injectable()
export class SlackNotifierClient {
  private readonly logger = new Logger(SlackNotifierClient.name);
  private readonly webhookUrl = process.env.SLACK_WEBHOOK_URL;

  async send(message: SlackMessage): Promise<void> {
    if (!this.webhookUrl) {
      return;
    }

    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      });
      if (!response.ok) {
        this.logger.error(
          `Slack 알림 전송 실패(status: ${response.status})`,
          { event: 'slack_notify_failed', errorCode: String(response.status) },
        );
      }
    } catch (err) {
      this.logger.error(
        `Slack 알림 전송 실패: ${(err as Error).message}`,
        { event: 'slack_notify_failed' },
      );
    }
  }
}
