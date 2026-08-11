import { io, type Socket } from 'socket.io-client';
import { API_BASE_URL } from './client';
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

export interface RoomServerToClientEvents {
  'chat:message': (payload: ChatMessageEvent) => void;
  'chat:system': (payload: ChatSystemEvent) => void;
  'room:error': (payload: RoomErrorEvent) => void;
  'room:state': (payload: RoomItemDto) => void;
}

export interface TimeSyncResponse {
  serverTime: number;
}

export interface RoomClientToServerEvents {
  'room:enter': (payload: { roomId: string; userId: string }) => void;
  'chat:message': (payload: { message: string }) => void;
  'room:leave': () => void;
  'game:start': () => void;
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
  return io(`${API_BASE_URL}/rooms`, {
    transports: ['websocket'],
    autoConnect: false,
  });
}
