import { Logger } from '@nestjs/common';

const logger = new Logger('SlackResponseUrl');

export interface SlackResponseUrlBody {
  text: string;
  response_type?: 'ephemeral' | 'in_channel';
}

/**
 * Slack 인터랙션 payload의 response_url로 결과를 회신한다. SlackNotifierClient가 쓰는
 * 고정 Incoming Webhook과 달리 인터랙션 한 건마다 임시로 발급되는 URL이라 재사용할
 * 고정 클라이언트가 없다 - best-effort로 동작한다(핵심 승인/반려 처리는 이미 끝난 뒤
 * 보내는 부가 알림이므로, 실패해도 던지지 않고 로깅만 한다).
 */
export async function postToSlackResponseUrl(
  responseUrl: string,
  body: SlackResponseUrlBody,
): Promise<void> {
  try {
    const response = await fetch(responseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      logger.error(`Slack response_url 회신 실패(status: ${response.status})`);
    }
  } catch (err) {
    logger.error(`Slack response_url 회신 실패: ${(err as Error).message}`);
  }
}
