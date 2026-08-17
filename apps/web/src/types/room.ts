export interface RoomParticipantDto {
  userId: string;
  nickname: string;
  score: number;
  /** 로그인 계정으로 참가했는지 여부. true면 방 안에서 닉네임을 바꿀 수 없다. */
  isAccount: boolean;
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
  /** 정답 공개 전에는 null, 라운드 종료 후 문의 접수용 quizSongId 공개 */
  quizSongId: string | null;
}

export interface RoomItemDto {
  roomId: string;
  roomTtl: string;
  quizId: string;
  quizTtl: string;
  quizDesc: string | null;
  songCount: number;
  songLimit: number;
  quizThumbImgUrl: string | null;
  atstIds: string[];
  atstNms: string[];
  isRandom: boolean;
  /** 비공개방 여부. true면 방 목록에 노출되지 않고 링크로만 입장할 수 있다 */
  isUnlisted: boolean;
  /** 비밀방 여부. true면 입장 시 비밀번호가 필요하다 */
  isPrivate: boolean;
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
  /** 이 방 참가자 본인만 아는 비공개 접근 토큰. 소켓 입장/퇴장 시 필요하다. */
  accessToken: string;
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
  /** 출제곡 수. 미지정 시 퀴즈 전체 출제곡 수를 사용한다. */
  songLimit?: number;
  /** 비공개방 여부. true면 방 목록에 노출되지 않고 링크로만 입장할 수 있다. */
  isUnlisted?: boolean;
  /** 비밀방 여부. true면 입장 시 password가 일치해야 한다. */
  isPrivate?: boolean;
  /** isPrivate가 true일 때 필요한 입장 비밀번호. */
  password?: string;
}

export interface JoinRoomRequestDto {
  nickname: string;
  /** 비밀방 입장 비밀번호. 비밀방이 아니면 무시된다. */
  password?: string;
}

export interface LeaveRoomRequestDto {
  userId: string;
  accessToken: string;
}

export interface UpdateNicknameRequestDto {
  userId: string;
  accessToken: string;
  nickname: string;
}

export interface UpdateRoomRequestDto {
  userId: string;
  accessToken: string;
  roomTtl: string;
  quizId: string;
  isRandom: boolean;
  speedModeEnabled: boolean;
  maxUserCnt: number;
  songLimit?: number;
  isUnlisted: boolean;
  isPrivate: boolean;
  /** isPrivate가 true일 때의 입장 비밀번호. 비워두면 기존 비밀번호가 유지된다. */
  password?: string;
}
