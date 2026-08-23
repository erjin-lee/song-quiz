import { randomUUID } from 'node:crypto';
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { trace } from '@opentelemetry/api';
import { Observable } from 'rxjs';
import { Socket } from 'socket.io';
import { LogContext, runWithLogContext } from './log-context';

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

/**
 * Socket.IO 게이트웨이 전용. 메시지(payload)마다 새 requestId를 발급한다.
 * roomId/userId는 메시지 payload에 있으면 그 값을, 없으면(RoomGateway의
 * room:enter 이후 chat:message 등 대부분의 후속 이벤트가 이 경우다) room:enter
 * 처리 쪽에서 client.data에 저장해둔 값을 fallback으로 사용한다. 게이트웨이
 * 클래스에 @UseInterceptors(...)로 붙여 쓴다.
 *
 * traceId는 HttpRequestContextMiddleware와 동일하게 OTel 활성 span에서만
 * 읽는다(@opentelemetry/instrumentation-socket.io가 메시지 이벤트마다 receive
 * span을 새로 연다). 예전에는 핸드셰이크의 x-trace-id를 연결 시점에 한 번 읽어
 * client.data에 캐싱해 소켓 생명주기 내내 재사용했는데, OTel은 메시지마다
 * 독립된 새 trace를 만들기 때문에 그 캐싱된 값을 계속 쓰면 StructuredLogger가
 * 매 로그 호출마다 활성 span에서 새로 읽는 spanId(§structured-logger.ts)와
 * 서로 다른 trace를 가리키는 traceId가 한 로그에 같이 찍히는 문제가 있었다.
 * 활성 span이 없으면(계측 비활성화 등) traceId도 없다.
 */
@Injectable()
export class SocketRequestContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const wsContext = context.switchToWs();
    const client = wsContext.getClient<Socket>();
    const data = wsContext.getData<Record<string, unknown> | undefined>();

    const traceId = trace.getActiveSpan()?.spanContext().traceId;

    const roomId = readString(data?.roomId) ?? readString(client.data?.roomId);
    const userId = readString(data?.userId) ?? readString(client.data?.userId);

    const logContext: Partial<LogContext> = {
      requestId: randomUUID(),
      ...(traceId ? { traceId } : {}),
      ...(roomId ? { roomId } : {}),
      ...(userId ? { userId } : {}),
    };

    return runWithLogContext(logContext, () => next.handle());
  }
}
