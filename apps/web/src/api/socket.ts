import { io, type Socket } from 'socket.io-client';
import { API_BASE_URL } from './client';
import type { RoomParticipantDto } from '../types/room';

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

export interface RoomParticipantsUpdatedEvent {
  participants: RoomParticipantDto[];
}

export interface RoomServerToClientEvents {
  'chat:message': (payload: ChatMessageEvent) => void;
  'chat:system': (payload: ChatSystemEvent) => void;
  'room:error': (payload: RoomErrorEvent) => void;
  'room:participants-updated': (payload: RoomParticipantsUpdatedEvent) => void;
}

export interface RoomClientToServerEvents {
  'room:enter': (payload: { roomId: string; userId: string }) => void;
  'chat:message': (payload: { message: string }) => void;
  'room:leave': () => void;
}

export type RoomSocket = Socket<RoomServerToClientEvents, RoomClientToServerEvents>;

export function createRoomSocket(): RoomSocket {
  return io(`${API_BASE_URL}/rooms`, {
    transports: ['websocket'],
    autoConnect: false,
  });
}
