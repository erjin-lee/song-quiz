import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CacheService } from '../cache/cache.service';
import { QuizRoundData } from './clients/quiz.client';
import { RoomItemDto } from './dto/room-item.dto';
import { RoomFencedStateStore } from './room-fenced-state.store';

const ROOM_CACHE_KEY_PREFIX = 'room:';
const SONG_ORDER_CACHE_KEY_PREFIX = 'room:song-order:';
const ROUNDS_SNAPSHOT_CACHE_KEY_PREFIX = 'room:rounds:';
const CURRENT_ANSWERS_CACHE_KEY_PREFIX = 'room:answers:';
const CURRENT_REVEAL_CACHE_KEY_PREFIX = 'room:reveal:';
/** 방은 활동(생성/입장/퇴장/게임 진행)이 있을 때마다 TTL이 갱신되는 슬라이딩 방식이다. */
export const ROOM_TTL_SECONDS = 6 * 60 * 60;

/**
 * roomId별 상태를 보호하는 락 키. RoomService.withRoomLock이 잡는 키와 저장소가
 * fencing 범위를 대조할 때 쓰는 키가 반드시 같아야 해서, 양쪽이 각자 문자열을
 * 조립하지 않고 이 함수 하나만 쓴다.
 */
export function roomLockKey(roomId: string): string {
  return `room:${roomId}`;
}

/**
 * 캐시에 저장하는 내부 표현. pwdHash는 절대 클라이언트로 나가면 안 되므로(비밀방
 * 비밀번호 해시가 노출되면 오프라인 대입 공격이 가능해진다), RoomItemDto(공개 응답
 * 타입)에는 포함하지 않고 이 내부 타입에만 둔다. toPublicRoom을 거치지 않은 값을
 * 절대 컨트롤러 반환값/소켓 브로드캐스트로 내보내지 않는다.
 */
export type RoomRecord = RoomItemDto & { pwdHash: string | null };

/**
 * room 도메인의 핵심 Redis 저장소. room 레코드 자체와, 그와 생명주기가 같은 라운드
 * 진행 데이터(songOrder/roundsSnapshot/currentAnswers/currentReveal)의 get·set·delete만
 * 담당한다. room:index는 RoomIndexRepository, 채팅 히스토리는 ChatHistoryRepository,
 * IP 기준 abuse 방지 카운터는 RoomAbuseGuardRepository가 각각 담당한다 — 전부 이
 * 클래스가 하던 일이었지만, room 상태(fencing 보호)와 무관한 관심사라 분리했다.
 * 라운드 진행 오케스트레이션(RoomRoundService/RoomService)이 이 계층을 호출한다.
 */
@Injectable()
export class RoomRepository {
  private readonly logger = new Logger(RoomRepository.name);

  constructor(
    private readonly cacheService: CacheService,
    private readonly stateStore: RoomFencedStateStore,
  ) {}

  /** pwdHash를 포함한 내부 표현을 반환한다. 응답/브로드캐스트 직전에는 반드시 toPublicRoom을 거쳐야 한다. */
  /**
   * 캐시에서 읽은 값을 그대로 신뢰하지 않고, 배포 전에 만들어진(비공개방/비밀방 기능
   * 추가 이전) 방 데이터에 없는 필드를 기본값으로 보정한다. 보정하지 않으면 이런 방을
   * 수정할 때 클라이언트가 undefined를 보내 @IsBoolean() 검증에서 400이 발생한다.
   */
  async getRoomRecord(roomId: string): Promise<RoomRecord | undefined> {
    const room = await this.cacheService.get<RoomRecord>(this.roomKey(roomId));
    if (!room) {
      return undefined;
    }
    return {
      ...room,
      isUnlisted: room.isUnlisted ?? false,
      isPrivate: room.isPrivate ?? false,
      pwdHash: room.pwdHash ?? null,
      participants: room.participants.map((participant) => ({
        ...participant,
        isAccount: participant.isAccount ?? false,
      })),
    };
  }

  /**
   * room:index 정리(reconciliation) 전용 존재 확인. getRoomRecord()는 Redis 오류 시
   * 로컬 폴백으로 undefined를 반환할 수 있어(목록 표시용으로는 안전하지만), 그 결과를
   * "방이 진짜 없다"고 오인해 index에서 지우면 일시 오류로 살아있는 방이 영구히
   * 사라진다. getStrict는 폴백 없이 Redis 오류를 그대로 던지므로, 호출자가 "정말 없음"과
   * "지금은 판단 불가"를 구분할 수 있다.
   */
  async roomExistsStrict(roomId: string): Promise<boolean> {
    const room = await this.cacheService.getStrict<RoomRecord>(
      this.roomKey(roomId),
    );
    return room !== undefined;
  }

  async getRoomOrThrow(roomId: string): Promise<RoomRecord> {
    const room = await this.getRoomRecord(roomId);
    if (!room) {
      throw new NotFoundException(`방을 찾을 수 없습니다. (roomId: ${roomId})`);
    }
    return room;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  toPublicRoom({ pwdHash, ...publicRoom }: RoomRecord): RoomItemDto {
    return publicRoom;
  }

  /**
   * room 상태는 여러 인스턴스가 공유하는 핵심 데이터라 cacheService.set()의 "Redis
   * 실패 시 로컬로 조용히 폴백" 동작을 쓰면 안 된다 — 폴백하면 이 인스턴스에서는
   * 성공한 것처럼 보이지만 실제 공유 Redis에는 반영되지 않아, 이미 Redis에 반영된
   * 타이머 예약(RoomTimerService) 등과 어긋나는 조용한 정합성 문제로 이어진다.
   * stateStore.writeSharedState는 실패를 그대로 던지므로 호출자(withRoomLock 내부)가
   * 상태 저장 실패를 알아채고 이후 정리(cleanupStaleRoundTimers 등)를 건너뛸 수 있다.
   */
  async saveRoom(room: RoomItemDto): Promise<void> {
    await this.stateStore.writeSharedState(
      this.roomKey(room.roomId),
      room,
      ROOM_TTL_SECONDS,
      roomLockKey(room.roomId),
    );
  }

  async deleteRoomRecord(roomId: string): Promise<void> {
    await this.stateStore.deleteSharedState(
      this.roomKey(roomId),
      roomLockKey(roomId),
    );
  }

  private roomKey(roomId: string): string {
    return `${ROOM_CACHE_KEY_PREFIX}${roomId}`;
  }

  /**
   * songOrder/roundsSnapshot/currentAnswers/currentReveal는 room 상태와 마찬가지로
   * 여러 인스턴스가 공유해야 하는 라운드 진행 데이터라 get/set이 아니라
   * getStrict/setStrict를 쓴다. 일반 get/set의 로컬 폴백을 허용하면, room 상태
   * (setStrict로 이미 보호됨)는 Redis에 반영됐는데 이 데이터만 이 인스턴스의 로컬
   * 캐시에만 남는 상황이 생길 수 있다 — 다른 인스턴스가 곡 순서를 빈 배열로 읽어
   * 게임을 조기 종료하거나, 정답을 인식하지 못하는 등 감지하기 어려운 정합성
   * 문제로 이어진다.
   */
  async getSongOrder(roomId: string): Promise<string[]> {
    return (
      (await this.cacheService.getStrict<string[]>(
        this.songOrderKey(roomId),
      )) ?? []
    );
  }

  async setSongOrder(roomId: string, songOrder: string[]): Promise<void> {
    await this.stateStore.writeSharedState(
      this.songOrderKey(roomId),
      songOrder,
      ROOM_TTL_SECONDS,
      roomLockKey(roomId),
    );
  }

  async deleteSongOrder(roomId: string): Promise<void> {
    await this.stateStore.deleteSharedState(
      this.songOrderKey(roomId),
      roomLockKey(roomId),
    );
  }

  private songOrderKey(roomId: string): string {
    return `${SONG_ORDER_CACHE_KEY_PREFIX}${roomId}`;
  }

  async getRoundsSnapshot(
    roomId: string,
  ): Promise<Record<string, QuizRoundData>> {
    return (
      (await this.cacheService.getStrict<Record<string, QuizRoundData>>(
        this.roundsSnapshotKey(roomId),
      )) ?? {}
    );
  }

  async setRoundsSnapshot(
    roomId: string,
    snapshot: Record<string, QuizRoundData>,
  ): Promise<void> {
    await this.stateStore.writeSharedState(
      this.roundsSnapshotKey(roomId),
      snapshot,
      ROOM_TTL_SECONDS,
      roomLockKey(roomId),
    );
  }

  async deleteRoundsSnapshot(roomId: string): Promise<void> {
    await this.stateStore.deleteSharedState(
      this.roundsSnapshotKey(roomId),
      roomLockKey(roomId),
    );
  }

  private roundsSnapshotKey(roomId: string): string {
    return `${ROUNDS_SNAPSHOT_CACHE_KEY_PREFIX}${roomId}`;
  }

  async getCurrentAnswers(roomId: string): Promise<string[]> {
    return (
      (await this.cacheService.getStrict<string[]>(
        this.currentAnswersKey(roomId),
      )) ?? []
    );
  }

  async setCurrentAnswers(roomId: string, answers: string[]): Promise<void> {
    await this.stateStore.writeSharedState(
      this.currentAnswersKey(roomId),
      answers,
      ROOM_TTL_SECONDS,
      roomLockKey(roomId),
    );
  }

  async deleteCurrentAnswers(roomId: string): Promise<void> {
    await this.stateStore.deleteSharedState(
      this.currentAnswersKey(roomId),
      roomLockKey(roomId),
    );
  }

  private currentAnswersKey(roomId: string): string {
    return `${CURRENT_ANSWERS_CACHE_KEY_PREFIX}${roomId}`;
  }

  async getCurrentReveal(
    roomId: string,
  ): Promise<
    | { quizSongId: string; songNm: string; atstNm: string; albmNm: string }
    | undefined
  > {
    return this.cacheService.getStrict(this.currentRevealKey(roomId));
  }

  async setCurrentReveal(
    roomId: string,
    reveal: {
      quizSongId: string;
      songNm: string;
      atstNm: string;
      albmNm: string;
    },
  ): Promise<void> {
    await this.stateStore.writeSharedState(
      this.currentRevealKey(roomId),
      reveal,
      ROOM_TTL_SECONDS,
      roomLockKey(roomId),
    );
  }

  async deleteCurrentReveal(roomId: string): Promise<void> {
    await this.stateStore.deleteSharedState(
      this.currentRevealKey(roomId),
      roomLockKey(roomId),
    );
  }

  private currentRevealKey(roomId: string): string {
    return `${CURRENT_REVEAL_CACHE_KEY_PREFIX}${roomId}`;
  }
}
