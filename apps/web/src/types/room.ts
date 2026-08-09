export interface RoomParticipantDto {
  userId: string;
  nickname: string;
  score: number;
}

export type GameStatus =
  | 'WAITING'
  | 'LOADING'
  | 'READY_TO_PLAY'
  | 'PLAYING'
  | 'ROUND_ENDED'
  | 'FINISHED';

export interface RoundPublicStateDto {
  roundIndex: number;
  totalRounds: number;
  youtubeVideoId: string | null;
  startSec: number | null;
  endSec: number | null;
  readyUserIds: string[];
  correctUserIds: string[];
  skipUserIds: string[];
  playStartedAt: string | null;
  revealed: boolean;
  songNm: string | null;
  atstNm: string | null;
  albmNm: string | null;
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
  gameStatus: GameStatus;
  currentRound: RoundPublicStateDto | null;
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
