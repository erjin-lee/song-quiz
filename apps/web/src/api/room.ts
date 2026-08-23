import { gameGet, gamePatch, gamePost } from './client';
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
  return gameGet<RoomItemDto[]>('/rooms');
}

export function getRoomById(roomId: string): Promise<RoomItemDto> {
  return gameGet<RoomItemDto>(`/rooms/${roomId}`);
}

export function createRoom(
  body: CreateRoomRequestDto,
): Promise<RoomJoinResultDto> {
  return gamePost<RoomJoinResultDto>('/rooms', body);
}

export function joinRoom(
  roomId: string,
  body: JoinRoomRequestDto,
): Promise<RoomJoinResultDto> {
  return gamePost<RoomJoinResultDto>(`/rooms/${roomId}/join`, body);
}

export function updateRoom(
  roomId: string,
  body: UpdateRoomRequestDto,
): Promise<RoomItemDto> {
  return gamePatch<RoomItemDto>(`/rooms/${roomId}`, body);
}

export function updateNickname(
  roomId: string,
  body: UpdateNicknameRequestDto,
): Promise<RoomItemDto> {
  return gamePost<RoomItemDto>(`/rooms/${roomId}/nickname`, body);
}

export function leaveRoom(
  roomId: string,
  userId: string,
  accessToken: string,
): Promise<LeaveRoomResultDto> {
  return gamePost<LeaveRoomResultDto>(`/rooms/${roomId}/leave`, {
    userId,
    accessToken,
  });
}
