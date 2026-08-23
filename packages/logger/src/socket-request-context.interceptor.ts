import { randomUUID } from 'node:crypto';
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { Socket } from 'socket.io';
import { LogContext, runWithLogContext } from './log-context';

function readHandshakeHeader(client: Socket, name: string): string | undefined {
  const value = client.handshake?.headers?.[name];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

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
 * traceId는 HttpRequestContextMiddleware와 마찬가지로 임의 생성하지 않는다 —
 * 핸드셰이크의 x-trace-id 헤더가 있을 때만(연결 시 한 번 읽어 소켓 생명주기
 * 동안 client.data에 재사용) 채운다.
 */
@Injectable()
export class SocketRequestContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const wsContext = context.switchToWs();
    const client = wsContext.getClient<Socket>();
    const data = wsContext.getData<Record<string, unknown> | undefined>();

    let traceId = client.data?.traceId as string | undefined;
    if (traceId === undefined) {
      traceId = readHandshakeHeader(client, 'x-trace-id');
      if (traceId) {
        client.data = { ...client.data, traceId };
      }
    }

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
