import { Injectable, Logger } from '@nestjs/common';
import { updateLogContext } from 'logger';
import { internalRequestHeaders } from '../common/internal-service.util';

export interface InquiryResultNotification {
  userId: string;
  inquiryId: string;
  status: 'REJECTED' | 'PENDING_REVIEW' | 'COMPLETED';
  message: string;
}

/**
 * apps/game의 RoomGateway.emitInquiryResult를 대신 호출하기 위한 내부 HTTP 클라이언트.
 * inquiry -> room 의존성을 없애기 위해 InquiryService가 더 이상 RoomGateway를 직접
 * import하지 않고 이 클라이언트를 거친다. 유저에게 알리는 건 best-effort이므로(핵심
 * 상태는 이미 DB에 저장된 뒤다) 실패해도 던지지 않고 로깅만 한다 — 기존 RoomGateway
 * 직접 호출도 실패할 수 없는 이벤트 emit이라 InquiryService.finish()가 이를 감싸지
 * 않았던 것과 동일한 신뢰 수준을 유지한다.
 */
@Injectable()
export class GameNotifierClient {
  private readonly logger = new Logger(GameNotifierClient.name);
  private readonly baseUrl = (
    process.env.GAME_SERVICE_URL ?? 'http://localhost:8002'
  ).replace(/\/$/, '');

  async notifyInquiryResult(payload: InquiryResultNotification): Promise<void> {
    try {
      const response = await fetch(
        `${this.baseUrl}/internal/rooms/inquiry-result`,
        {
          method: 'POST',
          headers: internalRequestHeaders(),
          body: JSON.stringify(payload),
        },
      );
      if (!response.ok) {
        updateLogContext({
          event: 'game_notify_failed',
          errorCode: String(response.status),
        });
        this.logger.error(
          `Game 서비스 문의 결과 알림 실패(status: ${response.status}, inquiryId: ${payload.inquiryId})`,
        );
      }
    } catch (err) {
      updateLogContext({ event: 'game_notify_failed' });
      this.logger.error(
        `Game 서비스 문의 결과 알림 실패(inquiryId: ${payload.inquiryId}): ${(err as Error).message}`,
      );
    }
  }
}
