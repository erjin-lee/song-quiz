export interface RoomParticipantDto {
  userId: string;
  nickname: string;
  score: number;
}

export type GameStatus =
  | 'WAITING'
  | 'LOADING'
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
  forceSkipAt: string | null;
  /** 스피드 모드: 첫 정답자가 나와 정답이 자동 공개될 예정 시각(ISO). 예약 전이면 null */
  autoRevealAt: string | null;
  /** 스피드 모드: 정답 공개 후 자동으로 다음 라운드로 넘어갈 예정 시각(ISO). 예약 전이면 null */
  autoNextRoundAt: string | null;
  /** 재생을 시작해야 하는 예정 시각(ISO, 서버 기준). 이 시각에 맞춰 재생해야 동시 재생이 가능하다. */
  playScheduledAt: string | null;
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
  /** 스피드 모드: 켜면 한 명이라도 정답을 맞히면 6초 뒤 자동 공개, 공개 4초 뒤 자동으로 다음 라운드로 진행 */
  speedModeEnabled: boolean;
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
  speedModeEnabled: boolean;
  maxUserCnt: number;
  nickname: string;
}

export interface JoinRoomRequestDto {
  nickname: string;
}

export interface LeaveRoomRequestDto {
  userId: string;
}
