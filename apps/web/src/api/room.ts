import { apiGet, apiPatch, apiPost } from './client';
import type {
  CreateRoomRequestDto,
  JoinRoomRequestDto,
  LeaveRoomResultDto,
  RoomItemDto,
  RoomJoinResultDto,
  UpdateNicknameRequestDto,
  UpdateRoomRequestDto,
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

export function updateRoom(
  roomId: string,
  body: UpdateRoomRequestDto,
): Promise<RoomItemDto> {
  return apiPatch<RoomItemDto>(`/rooms/${roomId}`, body);
}

export function updateNickname(
  roomId: string,
  body: UpdateNicknameRequestDto,
): Promise<RoomItemDto> {
  return apiPost<RoomItemDto>(`/rooms/${roomId}/nickname`, body);
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
