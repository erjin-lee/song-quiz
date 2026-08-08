import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { RoomService } from './room.service';

interface EnterRoomPayload {
  roomId: string;
  userId: string;
}

interface ChatMessagePayload {
  message: string;
}

interface SocketMembership {
  roomId: string;
  userId: string;
  nickname: string;
}

/**
 * 방 채팅 전용 소켓 게이트웨이.
 * 방 입장/퇴장/정원 등 방의 상태 자체는 REST(RoomController)가 기준(source of truth)이다.
 * 이 게이트웨이는 이미 REST로 입장한 유저를 소켓 룸에 연결해 실시간 채팅만 중계하고,
 * 명시적 퇴장(room:leave)이나 비정상 연결 종료 시 RoomService.leaveRoom을 호출해 정원을 정리한다.
 *
 * CORS origin은 apps/api/src/main.ts의 HTTP CORS 설정과 동일하게 맞춰야 한다.
 */
@WebSocketGateway({
  namespace: '/rooms',
  cors: { origin: 'http://localhost:5173' },
})
export class RoomGateway implements OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RoomGateway.name);
  private readonly socketMemberships = new Map<string, SocketMembership>();

  constructor(private readonly roomService: RoomService) {}

  @SubscribeMessage('room:enter')
  async handleEnter(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: EnterRoomPayload,
  ): Promise<void> {
    const room = await this.roomService.getRoom(payload.roomId);
    if (!room) {
      client.emit('room:error', { message: '방을 찾을 수 없습니다.' });
      return;
    }

    const participant = room.participants.find(
      (p) => p.userId === payload.userId,
    );
    if (!participant) {
      client.emit('room:error', {
        message: '방에 입장한 유저가 아닙니다. REST로 먼저 입장해주세요.',
      });
      return;
    }

    await client.join(payload.roomId);
    this.socketMemberships.set(client.id, {
      roomId: payload.roomId,
      userId: payload.userId,
      nickname: participant.nickname,
    });

    client.to(payload.roomId).emit('chat:system', {
      message: `${participant.nickname}님이 입장했습니다.`,
    });
    this.server
      .to(payload.roomId)
      .emit('room:participants-updated', { participants: room.participants });
  }

  @SubscribeMessage('chat:message')
  handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: ChatMessagePayload,
  ): void {
    const membership = this.socketMemberships.get(client.id);
    if (!membership) {
      client.emit('room:error', { message: '방에 먼저 입장해주세요.' });
      return;
    }

    this.server.to(membership.roomId).emit('chat:message', {
      userId: membership.userId,
      nickname: membership.nickname,
      message: payload.message,
      sentAt: new Date().toISOString(),
    });
  }

  @SubscribeMessage('room:leave')
  async handleLeave(@ConnectedSocket() client: Socket): Promise<void> {
    await this.leaveMembership(client);
  }

  async handleDisconnect(client: Socket): Promise<void> {
    await this.leaveMembership(client);
  }

  private async leaveMembership(client: Socket): Promise<void> {
    const membership = this.socketMemberships.get(client.id);
    if (!membership) {
      return;
    }

    this.socketMemberships.delete(client.id);
    await client.leave(membership.roomId);

    try {
      const result = await this.roomService.leaveRoom(
        membership.roomId,
        membership.userId,
      );

      client.to(membership.roomId).emit('chat:system', {
        message: `${membership.nickname}님이 퇴장했습니다.`,
      });
      if (!result.roomDeleted && result.room) {
        this.server
          .to(membership.roomId)
          .emit('room:participants-updated', {
            participants: result.room.participants,
          });
      }
    } catch (err) {
      // REST로 이미 퇴장 처리된 경우 등은 정상적인 상황이므로 조용히 무시한다.
      this.logger.debug(
        `소켓 퇴장 처리 스킵(이미 방을 나간 유저일 수 있음): ${(err as Error).message}`,
      );
    }
  }
}
