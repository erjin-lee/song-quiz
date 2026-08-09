export interface RoomParticipantDto {
  userId: string;
  nickname: string;
}

export interface RoomItemDto {
  roomId: string;
  roomTtl: string;
  quizId: string;
  quizTtl: string;
  atstIds: string[];
  atstNms: string[];
  isRandom: boolean;
  maxUserCnt: number;
  curUserCnt: number;
  hostUserId: string;
  participants: RoomParticipantDto[];
  crtDt: string;
}

export interface RoomJoinResultDto {
  room: RoomItemDto;
  userId: string;
}

export interface LeaveRoomResultDto {
  roomDeleted: boolean;
  room?: RoomItemDto;
}

export interface CreateRoomRequestDto {
  roomTtl: string;
  quizId: string;
  isRandom: boolean;
  maxUserCnt: number;
  nickname: string;
}

export interface JoinRoomRequestDto {
  nickname: string;
}

export interface LeaveRoomRequestDto {
  userId: string;
}
