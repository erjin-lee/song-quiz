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

function toUserId(value: unknown): number | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/**
 * Socket.IO 게이트웨이 전용. 소켓당 한 번 발급한 traceId를 client.data에 저장해
 * 그 소켓의 생명주기 동안 재사용하고(핸드셰이크 x-trace-id 헤더 우선, 없으면 생성),
 * 메시지(payload)마다 새 requestId를 발급한다. payload에 roomId/userId가 있으면
 * best-effort로 LogContext에 채운다. 게이트웨이 클래스에 @UseInterceptors(...)로 붙여 쓴다.
 */
@Injectable()
export class SocketRequestContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const wsContext = context.switchToWs();
    const client = wsContext.getClient<Socket>();
    const data = wsContext.getData<Record<string, unknown> | undefined>();

    const traceId =
      (client.data?.traceId as string | undefined) ??
      readHandshakeHeader(client, 'x-trace-id') ??
      randomUUID();
    client.data = { ...client.data, traceId };

    const roomId = typeof data?.roomId === 'string' ? data.roomId : undefined;
    const userId = toUserId(data?.userId);

    const logContext: Partial<LogContext> = {
      requestId: randomUUID(),
      traceId,
      ...(roomId ? { roomId } : {}),
      ...(userId !== undefined ? { userId } : {}),
    };

    return runWithLogContext(logContext, () => next.handle());
  }
}
