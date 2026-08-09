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
import { RoomItemDto } from './dto/room-item.dto';
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
 * 방 채팅 + 게임 진행 전용 소켓 게이트웨이.
 * 방 입장/퇴장/정원 등 방의 상태 자체는 REST(RoomController)가 기준(source of truth)이다.
 * 게임 시작/영상 로딩 완료/재생/다음 라운드는 실시간성이 필요해 소켓 이벤트로만 제공한다.
 * 방 상태가 바뀔 때마다 RoomService가 발생시키는 'room-updated' 이벤트를 구독해
 * 최신 RoomItemDto를 'room:state'로 방 전체에 브로드캐스트한다.
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

  constructor(private readonly roomService: RoomService) {
    this.roomService.on('room-updated', (room: RoomItemDto) => {
      this.server?.to(room.roomId).emit('room:state', room);
    });
  }

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
  }

  @SubscribeMessage('chat:message')
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: ChatMessagePayload,
  ): Promise<void> {
    const membership = this.socketMemberships.get(client.id);
    if (!membership) {
      client.emit('room:error', { message: '방에 먼저 입장해주세요.' });
      return;
    }

    try {
      const result = await this.roomService.submitChatMessage(
        membership.roomId,
        membership.userId,
        payload.message,
      );

      if (result.action === 'blocked') {
        client.emit('room:error', {
          message: '정답이 포함된 메시지는 전송할 수 없어요.',
        });
        return;
      }

      if (result.action === 'correct' && result.correctInfo) {
        this.server.to(membership.roomId).emit('chat:system', {
          message: `🎉 ${result.correctInfo.nickname}님이 정답을 맞췄습니다! (+${result.correctInfo.points}P)`,
        });
        return;
      }

      this.server.to(membership.roomId).emit('chat:message', {
        userId: membership.userId,
        nickname: membership.nickname,
        message: payload.message,
        sentAt: new Date().toISOString(),
      });
    } catch (err) {
      client.emit('room:error', { message: (err as Error).message });
    }
  }

  @SubscribeMessage('game:start')
  async handleGameStart(@ConnectedSocket() client: Socket): Promise<void> {
    const membership = this.requireMembership(client);
    if (!membership) return;

    try {
      await this.roomService.startGame(membership.roomId, membership.userId);
    } catch (err) {
      client.emit('room:error', { message: (err as Error).message });
    }
  }

  @SubscribeMessage('game:ready')
  async handleGameReady(@ConnectedSocket() client: Socket): Promise<void> {
    const membership = this.requireMembership(client);
    if (!membership) return;

    try {
      await this.roomService.markReady(membership.roomId, membership.userId);
    } catch (err) {
      client.emit('room:error', { message: (err as Error).message });
    }
  }

  @SubscribeMessage('game:play')
  async handleGamePlay(@ConnectedSocket() client: Socket): Promise<void> {
    const membership = this.requireMembership(client);
    if (!membership) return;

    try {
      await this.roomService.startRound(membership.roomId, membership.userId);
    } catch (err) {
      client.emit('room:error', { message: (err as Error).message });
    }
  }

  @SubscribeMessage('game:next-round')
  async handleGameNextRound(@ConnectedSocket() client: Socket): Promise<void> {
    const membership = this.requireMembership(client);
    if (!membership) return;

    try {
      await this.roomService.nextRound(membership.roomId, membership.userId);
    } catch (err) {
      client.emit('room:error', { message: (err as Error).message });
    }
  }

  @SubscribeMessage('room:leave')
  async handleLeave(@ConnectedSocket() client: Socket): Promise<void> {
    await this.leaveMembership(client);
  }

  async handleDisconnect(client: Socket): Promise<void> {
    await this.leaveMembership(client);
  }

  private requireMembership(client: Socket): SocketMembership | undefined {
    const membership = this.socketMemberships.get(client.id);
    if (!membership) {
      client.emit('room:error', { message: '방에 먼저 입장해주세요.' });
      return undefined;
    }
    return membership;
  }

  private async leaveMembership(client: Socket): Promise<void> {
    const membership = this.socketMemberships.get(client.id);
    if (!membership) {
      return;
    }

    this.socketMemberships.delete(client.id);
    await client.leave(membership.roomId);

    try {
      await this.roomService.leaveRoom(membership.roomId, membership.userId);
      client.to(membership.roomId).emit('chat:system', {
        message: `${membership.nickname}님이 퇴장했습니다.`,
      });
    } catch (err) {
      // REST로 이미 퇴장 처리된 경우 등은 정상적인 상황이므로 조용히 무시한다.
      this.logger.debug(
        `소켓 퇴장 처리 스킵(이미 방을 나간 유저일 수 있음): ${(err as Error).message}`,
      );
    }
  }
}
