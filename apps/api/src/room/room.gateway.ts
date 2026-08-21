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
import { RoomTimerService } from './room-timer.service';
import { NicknameChangedEvent, RoomService } from './room.service';

interface EnterRoomPayload {
  roomId: string;
  userId: string;
  /** createRoom/joinRoom 응답으로 발급받은 비공개 접근 토큰(본인 확인용). */
  accessToken: string;
}

interface ChatMessagePayload {
  message: string;
}

interface TimeSyncResponse {
  serverTime: number;
}

export interface InquiryResultPayload {
  inquiryId: string;
  status: 'REJECTED' | 'PENDING_REVIEW' | 'COMPLETED';
  message: string;
}

interface SocketMembership {
  roomId: string;
  userId: string;
  nickname: string;
}

/**
 * 소켓이 끊긴 뒤 실제로 참가자를 방에서 제거하기까지 주는 유예 시간. 새로고침처럼
 * 순간적으로 소켓이 끊겼다가 곧바로 재연결되는 경우와 진짜 퇴장(탭 종료, 네트워크
 * 이탈)을 서버는 구분할 수 없으므로, 이 시간 안에 같은 유저가 room:enter로 재연결하면
 * 제거를 취소해 참가자 레코드(점수 포함)를 그대로 보존한다.
 */
const DISCONNECT_GRACE_SECONDS = 10;

/**
 * 방 채팅 + 게임 진행 전용 소켓 게이트웨이.
 * 방 입장/퇴장/정원 등 방의 상태 자체는 REST(RoomController)가 기준(source of truth)이다.
 * 게임 시작/영상 로딩 완료/다음 라운드/스킵은 실시간성이 필요해 소켓 이벤트로만 제공한다.
 * 재생 자체는 전원 로딩 완료 시 서버가 자동으로 시작한다(별도 방장 조작 불필요).
 * 방 상태가 바뀔 때마다 RoomService가 발생시키는 'room-updated' 이벤트를 구독해
 * 최신 RoomItemDto를 'room:state'로 방 전체에 브로드캐스트한다.
 *
 * CORS origin은 apps/api/src/main.ts의 HTTP CORS 설정과 동일하게 맞춰야 한다.
 *
 * 여러 인스턴스로 확장될 수 있으므로(main.ts의 RedisIoAdapter), room 기반 emit
 * (`server.to(roomId).emit(...)`)은 어댑터가 자동으로 다른 인스턴스까지 전파해주지만,
 * "같은 유저의 다른 소켓이 아직 살아있는가"나 "재접속 유예 타이머" 같은 애플리케이션
 * 레벨 상태는 로컬 Map만으로는 다른 인스턴스의 소켓을 알 수 없다. 그래서
 * `hasOtherActiveSocket`은 `fetchSockets()`(어댑터가 인스턴스 간에도 집계해줌)로,
 * 재접속 유예는 RoomTimerService(Redis 기반, 인스턴스 간 취소 가능)로 처리한다.
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

  constructor(
    private readonly roomService: RoomService,
    private readonly roomTimerService: RoomTimerService,
  ) {
    this.roomService.on('room-updated', (room: RoomItemDto) => {
      this.server?.to(room.roomId).emit('room:state', room);
    });
    this.roomService.on('nickname-changed', (event: NicknameChangedEvent) => {
      // 이미 연결된 소켓들이 이전 닉네임을 들고 있으면 이후 채팅에 옛 닉네임이
      // 찍히므로, 같은 참가자의 소켓 멤버십도 함께 갱신한다.
      for (const membership of this.socketMemberships.values()) {
        if (
          membership.roomId === event.roomId &&
          membership.userId === event.userId
        ) {
          membership.nickname = event.newNickname;
        }
      }
      this.broadcastSystemMessage(
        event.roomId,
        undefined,
        `${event.oldNickname}님이 닉네임을 ${event.newNickname}(으)로 변경했습니다.`,
      ).catch((err) => {
        this.logger.error(
          `닉네임 변경 시스템 메시지 브로드캐스트 실패: ${(err as Error).message}`,
        );
      });
    });
    this.roomTimerService.registerHandler('disconnect-grace', (key) =>
      this.handleDisconnectGraceExpired(key),
    );
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

    // userId/hostUserId는 방 정보 조회로 누구나 알 수 있으므로, 참가자 본인만
    // 아는 accessToken을 함께 검증해야 다른 사람을 사칭한 접속을 막을 수 있다.
    if (
      !this.roomService.verifyMembershipToken(
        payload.roomId,
        payload.userId,
        payload.accessToken,
      )
    ) {
      client.emit('room:error', { message: '유효하지 않은 접근입니다.' });
      return;
    }

    // 유예 시간 안에 재연결한 경우(새로고침 등)는 예약된 퇴장 처리를 취소한다.
    // 이 경우 참가자 레코드가 그대로 유지되므로 "입장했습니다" 재안내도 생략한다.
    const isReconnect = await this.cancelPendingLeave(
      payload.roomId,
      payload.userId,
    );

    // fetchSockets()로 크로스 인스턴스 다중 탭/기기 감지를 하려면 소켓에 userId를
    // 실어둬야 한다(RemoteSocket.data는 어댑터를 통해 다른 인스턴스에도 전달됨).
    client.data.userId = payload.userId;

    await client.join(payload.roomId);
    await client.join(this.userChannel(payload.userId));
    this.socketMemberships.set(client.id, {
      roomId: payload.roomId,
      userId: payload.userId,
      nickname: participant.nickname,
    });

    client.emit(
      'chat:history',
      await this.roomService.getChatHistory(payload.roomId),
    );

    if (!isReconnect) {
      await this.broadcastSystemMessage(
        payload.roomId,
        client,
        `${participant.nickname}님이 입장했습니다.`,
      );
    }
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
        await this.broadcastSystemMessage(
          membership.roomId,
          undefined,
          `🎉 ${result.correctInfo.nickname}님이 정답을 맞췄습니다! (+${result.correctInfo.points}P)`,
        );
        return;
      }

      // 닉네임 변경이 다른 인스턴스에서 처리됐다면 이 인스턴스의 socketMemberships는
      // 갱신되지 않았을 수 있으므로, submitChatMessage가 공유 room 상태에서 조회해
      // 돌려준 닉네임을 우선 사용한다(동시에 로컬 캐시도 최신화해 다음 메시지부터는
      // 별도 조회 없이도 맞게 유지되도록 한다).
      const nickname = result.nickname ?? membership.nickname;
      membership.nickname = nickname;

      const sentAt = new Date().toISOString();
      await this.roomService.appendChatHistory(membership.roomId, {
        type: 'message',
        nickname,
        message: payload.message,
        sentAt,
      });
      this.server.to(membership.roomId).emit('chat:message', {
        userId: membership.userId,
        nickname,
        message: payload.message,
        sentAt,
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

  @SubscribeMessage('game:restart')
  async handleGameRestart(@ConnectedSocket() client: Socket): Promise<void> {
    const membership = this.requireMembership(client);
    if (!membership) return;

    try {
      await this.roomService.restartGame(membership.roomId, membership.userId);
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

  @SubscribeMessage('game:skip')
  async handleGameSkip(@ConnectedSocket() client: Socket): Promise<void> {
    const membership = this.requireMembership(client);
    if (!membership) return;

    try {
      await this.roomService.requestSkip(membership.roomId, membership.userId);
    } catch (err) {
      client.emit('room:error', { message: (err as Error).message });
    }
  }

  @SubscribeMessage('game:force-skip')
  async handleGameForceSkip(@ConnectedSocket() client: Socket): Promise<void> {
    const membership = this.requireMembership(client);
    if (!membership) return;

    try {
      await this.roomService.forceSkip(membership.roomId, membership.userId);
    } catch (err) {
      client.emit('room:error', { message: (err as Error).message });
    }
  }

  /**
   * 클라이언트-서버 clock offset 측정용 ping-pong. 방 상태와 무관해 락을 타지 않는다.
   * ack 콜백에 응답해야 하므로 반드시 값을 반환해야 한다(반환 없으면 클라이언트가 계속 대기).
   */
  @SubscribeMessage('time:sync')
  handleTimeSync(): TimeSyncResponse {
    return { serverTime: Date.now() };
  }

  /** 명시적 퇴장 의도이므로 유예 없이 즉시 처리한다. */
  @SubscribeMessage('room:leave')
  async handleLeave(@ConnectedSocket() client: Socket): Promise<void> {
    const membership = await this.detachSocket(client);
    if (!membership) {
      return;
    }
    await this.cancelPendingLeave(membership.roomId, membership.userId);
    await this.removeParticipant(membership.roomId, membership.userId);
  }

  /**
   * 소켓이 끊긴 것만으로는 새로고침인지 진짜 퇴장인지 구분할 수 없으므로, 곧바로
   * 참가자를 제거하지 않고 DISCONNECT_GRACE_SECONDS 뒤로 미룬다. 그 사이 같은 유저가
   * room:enter로 재연결하면(cancelPendingLeave) 이 예약은 취소된다. 재접속이 disconnect가
   * 발생한 인스턴스가 아닌 다른 인스턴스로 로드밸런싱될 수 있으므로, 이 예약은
   * RoomTimerService(Redis 기반)를 통해 인스턴스 간에도 취소 가능하게 관리한다.
   */
  async handleDisconnect(client: Socket): Promise<void> {
    const membership = await this.detachSocket(client);
    if (!membership) {
      return;
    }

    // 로그인 유저는 여러 탭/기기가 같은 userId(계정)로 접속할 수 있다. 그중
    // 하나만 끊긴 것이라면(다른 인스턴스에 붙어있는 소켓 포함) 퇴장 처리하지 않는다.
    if (await this.hasOtherActiveSocket(membership.roomId, membership.userId)) {
      return;
    }

    this.roomTimerService.schedule(
      'disconnect-grace',
      this.membershipKey(membership.roomId, membership.userId),
      DISCONNECT_GRACE_SECONDS,
    );
  }

  /** 재접속 유예 시간이 지난 뒤 호출된다. disconnect를 감지한 인스턴스가 아닐 수 있다. */
  private async handleDisconnectGraceExpired(key: string): Promise<void> {
    const { roomId, userId } = this.parseMembershipKey(key);
    // 발화 직전에도 다시 확인한다: 유예 시간 안에 다른 인스턴스로 재접속했는데
    // 그 사실을 모른 채(취소가 지연/유실된 극단적 경우) 퇴장시키는 것을 막는다.
    if (await this.hasOtherActiveSocket(roomId, userId)) {
      return;
    }
    await this.removeParticipant(roomId, userId);
  }

  private requireMembership(client: Socket): SocketMembership | undefined {
    const membership = this.socketMemberships.get(client.id);
    if (!membership) {
      client.emit('room:error', { message: '방에 먼저 입장해주세요.' });
      return undefined;
    }
    return membership;
  }

  private membershipKey(roomId: string, userId: string): string {
    return JSON.stringify({ roomId, userId });
  }

  private parseMembershipKey(key: string): { roomId: string; userId: string } {
    return JSON.parse(key) as { roomId: string; userId: string };
  }

  /**
   * 같은 roomId+userId로 아직 연결되어 있는 다른 소켓이 있는지 확인한다.
   * `fetchSockets()`는 Socket.IO Redis 어댑터가 붙어 있으면 다른 인스턴스의 소켓까지
   * 포함해 반환하므로(각 소켓의 `data` 필드도 함께 전달됨), 로컬 Map만 보던 기존 방식과
   * 달리 여러 인스턴스에 걸쳐 정확하게 판단할 수 있다.
   */
  private async hasOtherActiveSocket(
    roomId: string,
    userId: string,
  ): Promise<boolean> {
    if (!this.server) {
      return false;
    }
    const sockets = await this.server.in(roomId).fetchSockets();
    return sockets.some((socket) => socket.data?.userId === userId);
  }

  /** 유저별 개인 알림 채널(방 전체 브로드캐스트가 아닌 특정 유저 타겟팅용). */
  private userChannel(userId: string): string {
    return `user:${userId}`;
  }

  /** 문의(SQ_INQUIRY) 처리 결과를 제출한 유저에게만 전달한다. */
  emitInquiryResult(userId: string, payload: InquiryResultPayload): void {
    this.server?.to(this.userChannel(userId)).emit('inquiry:result', payload);
  }

  /** 예약된 퇴장 타이머가 있으면 취소한다. 실제로 취소했으면 true(재연결 상황)를 반환한다. */
  private async cancelPendingLeave(
    roomId: string,
    userId: string,
  ): Promise<boolean> {
    return this.roomTimerService.cancel(
      'disconnect-grace',
      this.membershipKey(roomId, userId),
    );
  }

  /** 소켓 매핑을 즉시 정리하고(소켓 자체는 이미 끊겼거나 끊기는 중이므로) 멤버십을 반환한다. */
  private async detachSocket(
    client: Socket,
  ): Promise<SocketMembership | undefined> {
    const membership = this.socketMemberships.get(client.id);
    if (!membership) {
      return undefined;
    }
    this.socketMemberships.delete(client.id);
    await client.leave(membership.roomId);
    return membership;
  }

  /**
   * 참가자를 실제로 방에서 제거하고 퇴장 사실을 알린다. 재접속 유예 만료 처리는
   * disconnect가 발생한 인스턴스가 아닌 다른 인스턴스에서 실행될 수 있으므로,
   * 로컬 소켓 멤버십에 남아있는 닉네임 대신 방 상태에서 최신 닉네임을 다시 조회한다.
   */
  private async removeParticipant(
    roomId: string,
    userId: string,
  ): Promise<void> {
    try {
      const room = await this.roomService.getRoom(roomId);
      const nickname =
        room?.participants.find((p) => p.userId === userId)?.nickname ??
        '알 수 없음';
      await this.roomService.leaveRoom(roomId, userId);
      await this.broadcastSystemMessage(
        roomId,
        undefined,
        `${nickname}님이 퇴장했습니다.`,
      );
    } catch (err) {
      // REST로 이미 퇴장 처리된 경우 등은 정상적인 상황이므로 조용히 무시한다.
      this.logger.debug(
        `소켓 퇴장 처리 스킵(이미 방을 나간 유저일 수 있음): ${(err as Error).message}`,
      );
    }
  }

  /**
   * 시스템 메시지를 히스토리에 기록하고 방에 브로드캐스트한다. excludeClient를 주면
   * 그 소켓을 제외한 나머지에게만 보낸다(입장 알림처럼 본인은 이미 알고 있는 경우).
   */
  private async broadcastSystemMessage(
    roomId: string,
    excludeClient: Socket | undefined,
    message: string,
  ): Promise<void> {
    const sentAt = new Date().toISOString();
    await this.roomService.appendChatHistory(roomId, {
      type: 'system',
      message,
      sentAt,
    });
    const emitter = excludeClient
      ? excludeClient.to(roomId)
      : this.server.to(roomId);
    emitter.emit('chat:system', { message });
  }
}
