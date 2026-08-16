import { apiGet, apiPost } from './client';
import type {
  CreateRoomRequestDto,
  JoinRoomRequestDto,
  LeaveRoomResultDto,
  RoomItemDto,
  RoomJoinResultDto,
} from '../types/room';

export function getRooms(): Promise<RoomItemDto[]> {
  return apiGet<RoomItemDto[]>('/rooms');
}

export function getRoomById(roomId: string): Promise<RoomItemDto> {
  return apiGet<RoomItemDto>(`/rooms/${roomId}`);
}

export function createRoom(
  body: CreateRoomRequestDto,
): Promise<RoomJoinResultDto> {
  return apiPost<RoomJoinResultDto>('/rooms', body);
}

export function joinRoom(
  roomId: string,
  body: JoinRoomRequestDto,
): Promise<RoomJoinResultDto> {
  return apiPost<RoomJoinResultDto>(`/rooms/${roomId}/join`, body);
}

export function leaveRoom(
  roomId: string,
  userId: string,
  accessToken: string,
): Promise<LeaveRoomResultDto> {
  return apiPost<LeaveRoomResultDto>(`/rooms/${roomId}/leave`, {
    userId,
    accessToken,
  });
}
