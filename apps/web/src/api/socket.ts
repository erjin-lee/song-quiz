import { io, type Socket } from 'socket.io-client';
import { GAME_BASE_URL } from './client';
import type { RoomItemDto } from '../types/room';

export interface ChatMessageEvent {
  userId: string;
  nickname: string;
  message: string;
  sentAt: string;
}

export interface ChatSystemEvent {
  message: string;
}

export interface RoomErrorEvent {
  message: string;
}

export interface InquiryResultEvent {
  inquiryId: string;
  status: 'REJECTED' | 'PENDING_REVIEW' | 'COMPLETED';
  message: string;
}

export interface ChatHistoryEntry {
  type: 'message' | 'system';
  nickname?: string;
  message: string;
  sentAt: string;
}

export interface RoomServerToClientEvents {
  'chat:message': (payload: ChatMessageEvent) => void;
  'chat:system': (payload: ChatSystemEvent) => void;
  'chat:history': (payload: ChatHistoryEntry[]) => void;
  'room:error': (payload: RoomErrorEvent) => void;
  'room:state': (payload: RoomItemDto) => void;
  'inquiry:result': (payload: InquiryResultEvent) => void;
}

export interface TimeSyncResponse {
  serverTime: number;
}

export interface RoomClientToServerEvents {
  'room:enter': (payload: {
    roomId: string;
    userId: string;
    accessToken: string;
  }) => void;
  'chat:message': (payload: { message: string }) => void;
  'room:leave': () => void;
  'game:start': () => void;
  'game:restart': () => void;
  'game:ready': () => void;
  'game:next-round': () => void;
  'game:skip': () => void;
  'game:force-skip': () => void;
  'time:sync': (
    payload: { clientSentAt: number },
    callback: (response: TimeSyncResponse) => void,
  ) => void;
}

export type RoomSocket = Socket<RoomServerToClientEvents, RoomClientToServerEvents>;

export function createRoomSocket(): RoomSocket {
  return io(`${GAME_BASE_URL}/rooms`, {
    transports: ['websocket'],
    autoConnect: false,
    // 기본값(1000ms, ±50% 지터)이면 서버 재배포처럼 순간적으로 끊겼다가 금방
    // 살아나는 경우에도 첫 재연결 시도가 RoomGamePage의 DISCONNECT_NOTICE_DELAY_MS
    // (800ms)보다 늦게 시작돼 끊김 안내가 뜨고 만다. 재연결 시도 자체를 앞당겨
    // 그 안에 재연결이 끝날 여지를 준다. 장시간 장애 시의 백오프 상한
    // (reconnectionDelayMax, 기본 5000ms)은 그대로 둔다.
    reconnectionDelay: 300,
  });
}
