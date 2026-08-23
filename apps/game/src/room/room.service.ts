import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { EventEmitter } from 'events';
import * as bcrypt from 'bcrypt';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { CacheService } from '../cache/cache.service';
import { QuizClient, QuizRoundData } from './clients/quiz.client';
import { CreateRoomRequestDto } from './dto/create-room-request.dto';
import { JoinRoomRequestDto } from './dto/join-room-request.dto';
import { LeaveRoomResultDto } from './dto/leave-room-result.dto';
import { RoomItemDto } from './dto/room-item.dto';
import { RoomJoinResultDto } from './dto/room-join-result.dto';
import { RoundPublicStateDto } from './dto/round-public-state.dto';
import { UpdateRoomRequestDto } from './dto/update-room-request.dto';
import { normalizeAnswer, pointsForRank } from './game-scoring.util';
import { RoomLockService } from './room-lock.service';
import { RoomTimerService } from './room-timer.service';

const BCRYPT_SALT_ROUNDS = 10;
/**
 * 비밀방 비밀번호 대입 시도 제한. 공개방 입장이나 성공한 입장까지 함께 제한되지
 * 않도록, "실패한 비밀번호 시도"만 방(roomId) + 요청 IP 기준으로 집계한다.
 */
const PASSWORD_ATTEMPT_LIMIT = 5;
const PASSWORD_ATTEMPT_WINDOW_SECONDS = 60;

const ROOM_INDEX_CACHE_KEY = 'room:index';
/** room:index read-modify-write를 인스턴스 간에 직렬화하기 위한 락 키. */
const ROOM_INDEX_LOCK_KEY = 'room-index';
const ROOM_CACHE_KEY_PREFIX = 'room:';
const PASSWORD_ATTEMPT_CACHE_KEY_PREFIX = 'room:pwd-attempts:';
const SONG_ORDER_CACHE_KEY_PREFIX = 'room:song-order:';
const ROUNDS_SNAPSHOT_CACHE_KEY_PREFIX = 'room:rounds:';
const CURRENT_ANSWERS_CACHE_KEY_PREFIX = 'room:answers:';
const CURRENT_REVEAL_CACHE_KEY_PREFIX = 'room:reveal:';
const CHAT_HISTORY_CACHE_KEY_PREFIX = 'room:chat:';
/** 방은 활동(생성/입장/퇴장/게임 진행)이 있을 때마다 TTL이 갱신되는 슬라이딩 방식이다. */
const ROOM_TTL_SECONDS = 6 * 60 * 60;
/** 한 라운드의 제한 시간. 이 시간이 지나면 전원이 못 맞춰도 라운드가 강제 종료된다. */
const ROUND_TIME_LIMIT_SECONDS = 30;
/** 방장이 강제 스킵을 요청한 뒤 실제로 라운드가 종료되기까지의 유예 시간. */
const FORCE_SKIP_DELAY_SECONDS = 3;
/**
 * 재생 시작 신호를 보낸 뒤 실제로 재생을 시작하기까지 주는 유예 시간.
 * 클라이언트마다 소켓 이벤트 수신 시각이 달라 즉시 재생하면 동시 재생이 어긋나므로,
 * 모두가 같은 미래 시각(now + 이 값)에 맞춰 재생을 시작하도록 예약한다.
 * 클라이언트가 clock offset을 보정해 재생 시각을 맞추므로, 소켓 전달 지연 편차만
 * 흡수하면 되는 짧은 값(1.8초)으로 충분하다.
 */
const PLAY_SCHEDULE_DELAY_SECONDS = Number(
  process.env.PLAY_SCHEDULE_DELAY_SECONDS ?? 1.8,
);
/** roomId별로 보관하는 채팅 히스토리 최대 개수. 초과분은 오래된 것부터 버린다. */
const CHAT_HISTORY_MAX_ENTRIES = Number(
  process.env.CHAT_HISTORY_MAX_ENTRIES ?? 100,
);
/** 스피드 모드에서 첫 정답자가 나온 뒤 정답을 자동 공개하기까지의 유예 시간. */
const SPEED_MODE_REVEAL_DELAY_SECONDS = Number(
  process.env.SPEED_MODE_REVEAL_DELAY_SECONDS ?? 6,
);
/** 스피드 모드에서 정답 공개 후 다음 라운드로 자동 전환되기까지의 유예 시간. */
const SPEED_MODE_NEXT_ROUND_DELAY_SECONDS = Number(
  process.env.SPEED_MODE_NEXT_ROUND_DELAY_SECONDS ?? 4,
);

export interface ChatSubmissionResult {
  action: 'broadcast' | 'blocked' | 'correct';
  /**
   * action이 'broadcast'일 때, 이 처리 시점에 공유 room 상태에서 조회한 발신자의
   * 최신 닉네임. 닉네임 변경이 다른 인스턴스에서 처리됐다면(RoomService의
   * nickname-changed는 프로세스 로컬 이벤트라 소켓이 붙은 인스턴스까지 전파되지
   * 않을 수 있다) 소켓 게이트웨이가 들고 있는 로컬 캐시가 오래됐을 수 있으므로,
   * 항상 이 값을 우선 사용해야 한다.
   */
  nickname?: string;
  correctInfo?: {
    userId: string;
    nickname: string;
    points: number;
    rank: number;
  };
}

export interface ChatHistoryEntry {
  type: 'message' | 'system';
  nickname?: string;
  message: string;
  sentAt: string;
}

/** 참가자 닉네임이 바뀌었을 때 발생하는 이벤트. RoomGateway가 구독해 채팅 시스템 메시지로 안내한다. */
export interface NicknameChangedEvent {
  roomId: string;
  userId: string;
  oldNickname: string;
  newNickname: string;
}

/**
 * REST로 새 참가자가 실제로 처음 입장했을 때만 발생하는 이벤트. RoomGateway가 구독해
 * "입장했습니다" 시스템 메시지를 보낸다. 소켓 room:enter(재연결 포함)가 아니라 REST
 * joinRoom 시점에만 발생시켜, 서버 재시작 등으로 소켓이 재연결될 때마다 입장 메시지가
 * 중복 기록되는 것을 막는다.
 */
export interface ParticipantJoinedEvent {
  roomId: string;
  userId: string;
  nickname: string;
}

/**
 * 캐시에 저장하는 내부 표현. pwdHash는 절대 클라이언트로 나가면 안 되므로(비밀방
 * 비밀번호 해시가 노출되면 오프라인 대입 공격이 가능해진다), RoomItemDto(공개 응답
 * 타입)에는 포함하지 않고 이 내부 타입에만 둔다. toPublicRoom을 거치지 않은 값을
 * 절대 컨트롤러 반환값/소켓 브로드캐스트로 내보내지 않는다.
 */
type RoomRecord = RoomItemDto & { pwdHash: string | null };

/**
 * 방/게임 상태가 바뀔 때마다 'room-updated' 이벤트로 최신 RoomItemDto를 전파한다.
 * RoomGateway가 구독해 소켓으로 브로드캐스트한다(REST 변경도 즉시 소켓에 반영됨).
 */
@Injectable()
export class RoomService extends EventEmitter {
  private readonly logger = new Logger(RoomService.name);

  /**
   * roomId -> 최근 채팅/시스템 메시지 히스토리(재접속 시 복원용, 최대 CHAT_HISTORY_MAX_ENTRIES개).
   * Redis가 설정돼 있으면 Redis LIST(room:chat:<roomId>)를 우선 사용하고, 이 Map은
   * append/조회 시점에 Redis 커맨드가 실패할 때만 쓰는 로컬 폴백 저장소로 남겨둔다.
   */
  private readonly chatHistory = new Map<string, ChatHistoryEntry[]>();

  constructor(
    private readonly cacheService: CacheService,
    private readonly roomLockService: RoomLockService,
    private readonly roomTimerService: RoomTimerService,
    private readonly quizClient: QuizClient,
  ) {
    super();
    this.roomTimerService.registerHandler('round-timeout', (roomId) =>
      this.handleRoundTimeout(roomId),
    );
    this.roomTimerService.registerHandler('speed-reveal', (roomId) =>
      this.handleSpeedModeReveal(roomId),
    );
    this.roomTimerService.registerHandler('speed-next', (roomId) =>
      this.handleAutoNextRound(roomId),
    );
  }

  /**
   * page/pageSize를 생략하면(undefined) 기존과 동일하게 전체 목록을 반환한다
   * — 페이지네이션 파라미터가 없는 기존 호출부(웹 클라이언트, 테스트)의
   * 응답 형식을 깨지 않기 위함이다.
   */
  async getRooms(page?: number, pageSize?: number): Promise<RoomItemDto[]> {
    const roomIds = await this.getRoomIndex();
    const records = await Promise.all(
      roomIds.map((roomId) => this.getRoomRecord(roomId)),
    );

    const publicRooms = records
      .filter(
        (room): room is RoomRecord => room !== undefined && !room.isUnlisted,
      )
      .map((room) => this.toPublicRoom(room));

    if (page === undefined || pageSize === undefined) {
      return publicRooms;
    }

    const start = (page - 1) * pageSize;
    return publicRooms.slice(start, start + pageSize);
  }

  async getRoom(roomId: string): Promise<RoomItemDto | undefined> {
    const record = await this.getRoomRecord(roomId);
    return record ? this.toPublicRoom(record) : undefined;
  }

  async createRoom(
    dto: CreateRoomRequestDto,
    accountUserId?: string,
  ): Promise<RoomJoinResultDto> {
    const summary = await this.quizClient.getSummary(dto.quizId);

    const songLimit = dto.songLimit ?? summary.songCount;
    if (songLimit > summary.songCount) {
      throw new BadRequestException(
        `출제곡 수는 퀴즈 전체 출제곡 수(${summary.songCount}곡)를 초과할 수 없습니다.`,
      );
    }

    if (dto.isPrivate && !dto.password) {
      throw new BadRequestException(
        '비밀방으로 설정하려면 비밀번호를 입력해야 합니다.',
      );
    }
    const pwdHash =
      dto.isPrivate && dto.password
        ? await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS)
        : null;

    const hostUserId = accountUserId ?? randomUUID();
    const room: RoomRecord = {
      roomId: randomUUID(),
      roomTtl: dto.roomTtl,
      quizId: dto.quizId,
      quizTtl: summary.quizTtl,
      quizDesc: summary.quizDesc,
      songCount: summary.songCount,
      songLimit,
      quizThumbImgUrl: summary.thumbImgUrl,
      atstIds: summary.atstIds,
      atstNms: summary.atstNms,
      isRandom: dto.isRandom,
      isUnlisted: dto.isUnlisted ?? false,
      isPrivate: dto.isPrivate ?? false,
      pwdHash,
      speedModeEnabled: dto.speedModeEnabled,
      maxUserCnt: dto.maxUserCnt,
      curUserCnt: 1,
      hostUserId,
      participants: [
        {
          userId: hostUserId,
          nickname: dto.nickname,
          score: 0,
          isAccount: Boolean(accountUserId),
        },
      ],
      crtDt: new Date().toISOString(),
      gameStatus: 'WAITING',
      currentRound: null,
    };

    await this.saveRoom(room);
    await this.addToIndex(room.roomId);

    const accessToken = this.computeMembershipToken(room.roomId, hostUserId);
    return { room: this.toPublicRoom(room), userId: hostUserId, accessToken };
  }

  async joinRoom(
    roomId: string,
    dto: JoinRoomRequestDto,
    accountUserId?: string,
    clientIp?: string,
  ): Promise<RoomJoinResultDto> {
    return this.withRoomLock(roomId, async () => {
      const room = await this.getRoomOrThrow(roomId);

      // 로그인 유저는 계정 userId를 그대로 참가자 ID로 쓰므로, 같은 방에
      // 다시 입장(재조회 등)하면 중복 참가자를 만들지 않고 그대로 재입장시킨다.
      if (accountUserId) {
        const existing = room.participants.find(
          (p) => p.userId === accountUserId,
        );
        if (existing) {
          const accessToken = this.computeMembershipToken(
            roomId,
            existing.userId,
          );
          return {
            room: this.toPublicRoom(room),
            userId: existing.userId,
            accessToken,
          };
        }
      }

      if (room.curUserCnt >= room.maxUserCnt) {
        throw new ConflictException('방 정원이 가득 찼습니다.');
      }

      if (room.isPrivate) {
        await this.assertPasswordAttemptAllowed(roomId, clientIp);

        const matches =
          room.pwdHash !== null &&
          (await bcrypt.compare(dto.password ?? '', room.pwdHash));
        if (!matches) {
          await this.recordFailedPasswordAttempt(roomId, clientIp);
          throw new UnauthorizedException('비밀번호가 올바르지 않습니다.');
        }
        await this.clearPasswordAttempts(roomId, clientIp);
      }

      const userId = accountUserId ?? randomUUID();
      room.participants.push({
        userId,
        nickname: dto.nickname,
        score: 0,
        isAccount: Boolean(accountUserId),
      });
      room.curUserCnt = room.participants.length;

      await this.saveRoom(room);
      this.emit('room-updated', this.toPublicRoom(room));
      this.emit('participant-joined', {
        roomId,
        userId,
        nickname: dto.nickname,
      });

      const accessToken = this.computeMembershipToken(roomId, userId);
      return { room: this.toPublicRoom(room), userId, accessToken };
    });
  }

  async leaveRoom(roomId: string, userId: string): Promise<LeaveRoomResultDto> {
    return this.withRoomLock(roomId, async () => {
      const room = await this.getRoomOrThrow(roomId);

      const participantIndex = room.participants.findIndex(
        (participant) => participant.userId === userId,
      );
      if (participantIndex === -1) {
        throw new NotFoundException('방에 참가 중인 유저가 아닙니다.');
      }

      room.participants.splice(participantIndex, 1);
      room.curUserCnt = room.participants.length;

      if (room.curUserCnt === 0) {
        await this.deleteRoom(roomId);
        return { roomDeleted: true };
      }

      if (room.hostUserId === userId) {
        room.hostUserId = room.participants[0].userId;
      }

      if (room.currentRound) {
        room.currentRound.readyUserIds = room.currentRound.readyUserIds.filter(
          (id) => id !== userId,
        );
        room.currentRound.correctUserIds =
          room.currentRound.correctUserIds.filter((id) => id !== userId);
        room.currentRound.skipUserIds = room.currentRound.skipUserIds.filter(
          (id) => id !== userId,
        );
      }

      let roundEnded = false;
      if (room.gameStatus === 'LOADING') {
        await this.recomputeReadyStatus(room);
      } else if (room.gameStatus === 'PLAYING' && room.currentRound) {
        const allAnswered = room.participants.every((participant) =>
          room.currentRound!.correctUserIds.includes(participant.userId),
        );
        if (allAnswered || this.hasSkipMajority(room)) {
          await this.finalizeRoundEnd(room);
          roundEnded = true;
        }
      }

      await this.saveRoom(room);
      if (roundEnded) {
        this.cleanupStaleRoundTimers(room);
      }
      this.emit('room-updated', this.toPublicRoom(room));

      return { roomDeleted: false, room: this.toPublicRoom(room) };
    });
  }

  /**
   * 방 안에서 참가자 본인의 닉네임을 바꾼다(게스트 전용 여부는 컨트롤러에서 검증한다).
   * 변경 사실은 'nickname-changed' 이벤트로 알려 RoomGateway가 채팅 시스템 메시지로
   * 안내하게 한다.
   */
  async updateNickname(
    roomId: string,
    userId: string,
    nickname: string,
  ): Promise<RoomItemDto> {
    return this.withRoomLock(roomId, async () => {
      const room = await this.getRoomOrThrow(roomId);
      const participant = room.participants.find((p) => p.userId === userId);
      if (!participant) {
        throw new NotFoundException('방에 참가 중인 유저가 아닙니다.');
      }
      // 컨트롤러의 Authorization 헤더 기반 게스트 판별은 헤더를 생략하면 우회할 수
      // 있으므로, 입장 시 서버가 결정해 저장해둔 participant.isAccount로 다시 검증한다.
      if (participant.isAccount) {
        throw new ForbiddenException(
          '로그인 유저는 방 안에서 닉네임을 변경할 수 없습니다.',
        );
      }

      const oldNickname = participant.nickname;
      if (oldNickname === nickname) {
        return this.toPublicRoom(room);
      }

      participant.nickname = nickname;
      await this.saveRoom(room);

      const publicRoom = this.toPublicRoom(room);
      this.emit('room-updated', publicRoom);
      this.emit('nickname-changed', {
        roomId,
        userId,
        oldNickname,
        newNickname: nickname,
      } satisfies NicknameChangedEvent);
      return publicRoom;
    });
  }

  /**
   * 방장이 게임 시작 전(WAITING) 또는 게임 종료 후(FINISHED)에 방 설정을 수정한다.
   * CreateRoomRequestDto와 동일한 필드 구성을 그대로 다시 제출받아 통째로 교체하는
   * 방식이라(부분 patch가 아님), quizId가 그대로여도 매번 퀴즈 정보를 다시 조회해
   * songCount/atstNms 등을 최신 상태로 맞춘다.
   */
  async updateRoom(
    roomId: string,
    dto: UpdateRoomRequestDto,
  ): Promise<RoomItemDto> {
    return this.withRoomLock(roomId, async () => {
      const room = await this.getRoomOrThrow(roomId);
      this.assertHost(room, dto.userId);

      if (room.gameStatus !== 'WAITING' && room.gameStatus !== 'FINISHED') {
        throw new ConflictException(
          '게임 시작 전이나 종료 후에만 방 정보를 수정할 수 있습니다.',
        );
      }

      if (dto.maxUserCnt < room.curUserCnt) {
        throw new BadRequestException(
          `최대 인원은 현재 참가 인원(${room.curUserCnt}명) 미만으로 설정할 수 없습니다.`,
        );
      }

      const summary = await this.quizClient.getSummary(dto.quizId);
      const songLimit = dto.songLimit ?? summary.songCount;
      if (songLimit > summary.songCount) {
        throw new BadRequestException(
          `출제곡 수는 퀴즈 전체 출제곡 수(${summary.songCount}곡)를 초과할 수 없습니다.`,
        );
      }

      let pwdHash: string | null = null;
      if (dto.isPrivate) {
        if (dto.password) {
          pwdHash = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);
        } else if (room.isPrivate) {
          pwdHash = room.pwdHash;
        } else {
          throw new BadRequestException(
            '비밀방으로 설정하려면 비밀번호를 입력해야 합니다.',
          );
        }
      }

      room.roomTtl = dto.roomTtl;
      room.quizId = dto.quizId;
      room.quizTtl = summary.quizTtl;
      room.quizDesc = summary.quizDesc;
      room.quizThumbImgUrl = summary.thumbImgUrl;
      room.atstIds = summary.atstIds;
      room.atstNms = summary.atstNms;
      room.songCount = summary.songCount;
      room.songLimit = songLimit;
      room.isRandom = dto.isRandom;
      room.speedModeEnabled = dto.speedModeEnabled;
      room.maxUserCnt = dto.maxUserCnt;
      room.isUnlisted = dto.isUnlisted;
      room.isPrivate = dto.isPrivate;
      room.pwdHash = pwdHash;

      await this.saveRoom(room);
      const publicRoom = this.toPublicRoom(room);
      this.emit('room-updated', publicRoom);
      return publicRoom;
    });
  }

  /** 방장이 게임을 시작한다. 첫 라운드를 준비하고 참가자들의 영상 로딩 완료를 기다린다. */
  async startGame(
    roomId: string,
    requesterUserId: string,
  ): Promise<RoomItemDto> {
    return this.withRoomLock(roomId, async () => {
      const room = await this.getRoomOrThrow(roomId);
      this.assertHost(room, requesterUserId);

      if (room.gameStatus !== 'WAITING') {
        throw new ConflictException('이미 시작되었거나 진행 중인 게임입니다.');
      }

      await this.prepareFirstRound(roomId, room);

      await this.saveRoom(room);
      this.emit('room-updated', this.toPublicRoom(room));
      return room;
    });
  }

  /** 방장이 종료된 게임을 같은 방/설정으로 다시 시작한다. 점수를 초기화하고 첫 라운드부터 다시 준비한다. */
  async restartGame(
    roomId: string,
    requesterUserId: string,
  ): Promise<RoomItemDto> {
    return this.withRoomLock(roomId, async () => {
      const room = await this.getRoomOrThrow(roomId);
      this.assertHost(room, requesterUserId);

      if (room.gameStatus !== 'FINISHED') {
        throw new ConflictException(
          '게임이 종료된 후에만 다시 시작할 수 있습니다.',
        );
      }

      room.participants = room.participants.map((participant) => ({
        ...participant,
        score: 0,
      }));

      await this.prepareFirstRound(roomId, room);

      await this.saveRoom(room);
      this.emit('room-updated', this.toPublicRoom(room));
      return room;
    });
  }

  /**
   * songOrder를 새로 구성하고, 게임 전체에서 쓸 라운드 데이터를 apps/api에서
   * 한 번에 스냅샷으로 받아 Redis에 캐시한 뒤 첫 라운드를 준비해 room을 LOADING
   * 상태로 만든다(room을 직접 변경한다). 라운드가 진행되는 동안(advanceToNextRound)
   * 에는 이 스냅샷만 읽고 apps/api를 다시 호출하지 않는다.
   */
  private async prepareFirstRound(
    roomId: string,
    room: RoomItemDto,
  ): Promise<void> {
    // incrementPlayCount와 getQuizRounds는 서로 결과를 필요로 하지 않으므로 병렬로
    // 호출한다 — 순차 호출하면 apps/api 왕복 시간이 그대로 두 배로 게임 시작 지연에 더해진다.
    const [, allRounds] = await Promise.all([
      this.quizClient.incrementPlayCount(room.quizId),
      this.quizClient.getQuizRounds(room.quizId),
    ]);
    if (allRounds.length === 0) {
      throw new NotFoundException('퀴즈에 출제곡이 없습니다.');
    }

    // quizSeq ASC 순서로 온 전체 라운드를 셔플/슬라이스한다(셔플 자체는 게임 서비스
    // 로컬 관심사라 apps/api에 위임하지 않는다). songLimit이 songCount보다 작으면
    // 실제로 출제되는 곡만 스냅샷에 남겨 Redis 페이로드를 불필요하게 키우지 않는다.
    const ordered = room.isRandom ? this.shuffle(allRounds) : allRounds;
    const selectedRounds = ordered.slice(0, room.songLimit);
    const songOrder = selectedRounds.map((roundData) => roundData.quizSongId);
    const snapshot: Record<string, QuizRoundData> = {};
    for (const roundData of selectedRounds) {
      snapshot[roundData.quizSongId] = roundData;
    }

    await Promise.all([
      this.setSongOrder(roomId, songOrder),
      this.setRoundsSnapshot(roomId, snapshot),
    ]);
    room.gameStatus = 'LOADING';
    room.currentRound = await this.prepareRoundData(
      roomId,
      songOrder[0],
      0,
      songOrder.length,
    );
  }

  /** 참가자가 현재 라운드 영상 로딩을 마쳤음을 알린다. */
  async markReady(roomId: string, userId: string): Promise<RoomItemDto> {
    return this.withRoomLock(roomId, async () => {
      const room = await this.getRoomOrThrow(roomId);
      const round = room.currentRound;

      if (!round || room.gameStatus !== 'LOADING') {
        return room;
      }

      if (!round.readyUserIds.includes(userId)) {
        round.readyUserIds.push(userId);
      }
      await this.recomputeReadyStatus(room);

      await this.saveRoom(room);
      this.emit('room-updated', this.toPublicRoom(room));
      return room;
    });
  }

  /** 방장이 라운드 종료 후 다음 라운드로 넘어간다(또는 마지막 라운드면 게임을 종료한다). */
  async nextRound(
    roomId: string,
    requesterUserId: string,
  ): Promise<RoomItemDto> {
    return this.withRoomLock(roomId, async () => {
      const room = await this.getRoomOrThrow(roomId);
      this.assertHost(room, requesterUserId);

      if (room.gameStatus !== 'ROUND_ENDED') {
        throw new ConflictException('아직 라운드가 끝나지 않았습니다.');
      }

      this.clearSpeedModeTimer(roomId);
      await this.advanceToNextRound(room);

      await this.saveRoom(room);
      this.emit('room-updated', this.toPublicRoom(room));
      return room;
    });
  }

  /**
   * 채팅 메시지를 정답 여부에 따라 처리한다.
   * - 정답과 무관: 그대로 채팅에 올린다.
   * - 정답 텍스트를 포함(스포일러): 채팅에 올리지 않고 조용히 막는다.
   * - 현재 라운드의 정답과 정확히 일치 + 아직 못 맞춘 경우: 점수를 매기고 정답 처리한다.
   */
  async submitChatMessage(
    roomId: string,
    userId: string,
    rawMessage: string,
  ): Promise<ChatSubmissionResult> {
    return this.withRoomLock(roomId, async () => {
      const room = await this.getRoomOrThrow(roomId);
      const round = room.currentRound;
      const nickname = room.participants.find(
        (p) => p.userId === userId,
      )?.nickname;

      if (!round || round.revealed) {
        return { action: 'broadcast', nickname };
      }

      const answers = (await this.getCurrentAnswers(roomId)).filter(
        (answer) => normalizeAnswer(answer).length > 0,
      );
      if (answers.length === 0) {
        return { action: 'broadcast', nickname };
      }

      const normalizedMessage = normalizeAnswer(rawMessage);
      const isExactMatch = answers.some(
        (answer) => normalizeAnswer(answer) === normalizedMessage,
      );
      const containsAnswer =
        isExactMatch ||
        answers.some((answer) =>
          normalizedMessage.includes(normalizeAnswer(answer)),
        );

      if (!containsAnswer) {
        return { action: 'broadcast', nickname };
      }

      const alreadyCorrect = round.correctUserIds.includes(userId);
      if (room.gameStatus !== 'PLAYING' || !isExactMatch || alreadyCorrect) {
        return { action: 'blocked' };
      }

      const rank = round.correctUserIds.length;
      round.correctUserIds.push(userId);
      const points = pointsForRank(rank);
      const participant = room.participants.find((p) => p.userId === userId);
      if (participant) {
        participant.score += points;
      }

      const allAnswered = room.participants.every((p) =>
        round.correctUserIds.includes(p.userId),
      );
      let roundEnded = false;
      if (allAnswered) {
        await this.finalizeRoundEnd(room);
        roundEnded = true;
      } else if (room.speedModeEnabled && round.correctUserIds.length === 1) {
        round.autoRevealAt = new Date(
          Date.now() + SPEED_MODE_REVEAL_DELAY_SECONDS * 1000,
        ).toISOString();
        await this.scheduleSpeedModeTimer(
          roomId,
          'speed-reveal',
          SPEED_MODE_REVEAL_DELAY_SECONDS,
        );
      }

      await this.saveRoom(room);
      if (roundEnded) {
        this.cleanupStaleRoundTimers(room);
      }
      this.emit('room-updated', this.toPublicRoom(room));

      return {
        action: 'correct',
        correctInfo: {
          userId,
          nickname: participant?.nickname ?? '',
          points,
          rank: rank + 1,
        },
      };
    });
  }

  /** 참가자가 현재 라운드 스킵을 요청한다. 과반이 요청하면 라운드가 즉시 종료(정답 공개)된다. */
  async requestSkip(roomId: string, userId: string): Promise<RoomItemDto> {
    return this.withRoomLock(roomId, async () => {
      const room = await this.getRoomOrThrow(roomId);
      const round = room.currentRound;

      if (!round || room.gameStatus !== 'PLAYING') {
        return room;
      }

      if (!round.skipUserIds.includes(userId)) {
        round.skipUserIds.push(userId);
      }

      const roundEnded = this.hasSkipMajority(room);
      if (roundEnded) {
        await this.finalizeRoundEnd(room);
      }

      await this.saveRoom(room);
      if (roundEnded) {
        this.cleanupStaleRoundTimers(room);
      }
      this.emit('room-updated', this.toPublicRoom(room));
      return room;
    });
  }

  /**
   * 방장이 현재 라운드를 강제로 스킵한다. 즉시 끝내지 않고 유예 시간(3초) 후 종료되도록
   * 예약해, 그 사이 마지막으로 답을 제출할 시간을 준다.
   */
  async forceSkip(
    roomId: string,
    requesterUserId: string,
  ): Promise<RoomItemDto> {
    return this.withRoomLock(roomId, async () => {
      const room = await this.getRoomOrThrow(roomId);
      this.assertHost(room, requesterUserId);

      const round = room.currentRound;
      if (!round || room.gameStatus !== 'PLAYING') {
        throw new ConflictException('지금은 강제 스킵을 요청할 수 없습니다.');
      }

      round.forceSkipAt = new Date(
        Date.now() + FORCE_SKIP_DELAY_SECONDS * 1000,
      ).toISOString();
      await this.scheduleRoundTimer(roomId, FORCE_SKIP_DELAY_SECONDS);

      await this.saveRoom(room);
      this.emit('room-updated', this.toPublicRoom(room));
      return room;
    });
  }

  /**
   * 채팅/시스템 메시지를 히스토리에 기록한다(재접속 시 복원용). 방 상태와 무관해 락을 타지 않는다.
   * 이 오퍼레이션은 스케줄/취소처럼 짝을 이루지 않는 단발성 append이므로, 매 호출 시점의
   * Redis 연결 상태(isRedisReady)로 그때그때 폴백해도 안전하다(RoomLockService/RoomTimerService의
   * "모드 고정" 원칙과 달리 append/조회가 서로 다른 백엔드를 타도 최악의 경우 최근 몇 건의
   * 순서만 어긋날 뿐 게임 상태 정합성에는 영향이 없다).
   * RPUSH+LTRIM+EXPIRE를 MULTI/EXEC로 묶어 여러 인스턴스에서 동시에 append해도 Redis의
   * 단일 스레드 실행 모델상 원자적으로 처리된다.
   */
  async appendChatHistory(
    roomId: string,
    entry: ChatHistoryEntry,
  ): Promise<void> {
    const redis = this.cacheService.getRedisClient();
    if (redis && this.cacheService.isRedisReady()) {
      try {
        const key = this.chatHistoryKey(roomId);
        await redis
          .multi()
          .rpush(key, JSON.stringify(entry))
          .ltrim(key, -CHAT_HISTORY_MAX_ENTRIES, -1)
          .expire(key, ROOM_TTL_SECONDS)
          .exec();
        return;
      } catch (err) {
        this.logger.warn(
          `채팅 히스토리 Redis 기록 실패(${roomId}), 로컬 메모리로 폴백합니다: ${(err as Error).message}`,
        );
      }
    }

    const history = this.chatHistory.get(roomId) ?? [];
    history.push(entry);
    if (history.length > CHAT_HISTORY_MAX_ENTRIES) {
      history.splice(0, history.length - CHAT_HISTORY_MAX_ENTRIES);
    }
    this.chatHistory.set(roomId, history);
  }

  /** roomId의 채팅 히스토리를 조회한다(재접속 시 복원용). */
  async getChatHistory(roomId: string): Promise<ChatHistoryEntry[]> {
    const redis = this.cacheService.getRedisClient();
    if (redis && this.cacheService.isRedisReady()) {
      try {
        const raw = await redis.lrange(this.chatHistoryKey(roomId), 0, -1);
        return raw.map((entry) => JSON.parse(entry) as ChatHistoryEntry);
      } catch (err) {
        this.logger.warn(
          `채팅 히스토리 Redis 조회 실패(${roomId}), 로컬 메모리로 폴백합니다: ${(err as Error).message}`,
        );
      }
    }
    return this.chatHistory.get(roomId) ?? [];
  }

  private chatHistoryKey(roomId: string): string {
    return `${CHAT_HISTORY_CACHE_KEY_PREFIX}${roomId}`;
  }

  private assertHost(room: RoomItemDto, requesterUserId: string): void {
    if (room.hostUserId !== requesterUserId) {
      throw new ForbiddenException('방장만 할 수 있는 작업입니다.');
    }
  }

  private async recomputeReadyStatus(room: RoomItemDto): Promise<void> {
    const round = room.currentRound;
    if (!round || room.gameStatus !== 'LOADING') {
      return;
    }
    const allReady = room.participants.every((participant) =>
      round.readyUserIds.includes(participant.userId),
    );
    if (allReady) {
      await this.beginRound(room);
    }
  }

  /**
   * 전원 로딩 완료 시 별도 방장 조작 없이 곧바로 재생 상태로 전환한다.
   * 실제 재생은 즉시가 아니라 PLAY_SCHEDULE_DELAY_SECONDS 뒤로 예약해, 모든
   * 클라이언트가 이벤트 수신 시각과 무관하게 같은 시각에 재생을 시작하도록 한다.
   * 라운드 제한시간도 이 예약 시각 기준으로 흐르도록 그만큼 늦춰서 건다.
   * 타이머 예약이 실패하면(scheduleRoundTimer가 던짐) gameStatus를 PLAYING으로
   * 바꾼 것까지 포함해 이 호출 전체가 실패해야 한다 — 그래야 뒤이은 saveRoom이
   * 건너뛰어져 "타임아웃 없이 PLAYING으로 저장된" 상태가 생기지 않는다.
   */
  private async beginRound(room: RoomItemDto): Promise<void> {
    if (!room.currentRound) {
      return;
    }
    room.gameStatus = 'PLAYING';
    room.currentRound.playScheduledAt = new Date(
      Date.now() + PLAY_SCHEDULE_DELAY_SECONDS * 1000,
    ).toISOString();
    await this.scheduleRoundTimer(
      room.roomId,
      ROUND_TIME_LIMIT_SECONDS + PLAY_SCHEDULE_DELAY_SECONDS,
    );
  }

  /** 참가자 과반(절반 초과)이 스킵을 요청했는지 확인한다. */
  private hasSkipMajority(room: RoomItemDto): boolean {
    const round = room.currentRound;
    if (!round) {
      return false;
    }
    const majorityThreshold = Math.floor(room.participants.length / 2) + 1;
    return round.skipUserIds.length >= majorityThreshold;
  }

  /**
   * 라운드를 종료(정답 공개) 상태로 만들고(room을 직접 변경), 스피드 모드면
   * "공개 후 자동 다음 라운드" 예약(speed-next)까지 만든다. 타임아웃/강제스킵/
   * 스킵과반/전원정답 등 어떤 경로로 호출되든 이 함수 하나로 모인다.
   *
   * round-timeout·speed-reveal 취소는 여기서 하지 않는다 — 호출자가 이 함수 뒤에
   * saveRoom까지 성공한 걸 확인한 다음 cleanupStaleRoundTimers를 불러야 한다. 이
   * 함수는 round-timeout/speed-reveal 핸들러 자신이 호출하는 경로도 있는데, saveRoom
   * 확인 전에 먼저 취소해버리면 saveRoom이 실패했을 때(Redis 단절 등) 그 핸들러
   * 자신의 claim과 새로 만든 speed-next까지 모두 사라져 방이 영구히 멈출 수 있다.
   * saveRoom이 실패하면 이 함수가 만든 speed-next와 기존 round-timeout/speed-reveal이
   * 모두 살아있는 채로 남고, 그중 먼저 발화하는 것이 이 함수를 처음부터 다시
   * 시도한다 — 이미 반영된 상태라면 각 핸들러의 gameStatus 가드가 no-op 처리한다.
   */
  private async finalizeRoundEnd(room: RoomItemDto): Promise<void> {
    if (!room.currentRound) {
      return;
    }
    const reveal = await this.getCurrentReveal(room.roomId);
    room.currentRound.revealed = true;
    room.currentRound.songNm = reveal?.songNm ?? null;
    room.currentRound.atstNm = reveal?.atstNm ?? null;
    room.currentRound.albmNm = reveal?.albmNm ?? null;
    room.currentRound.quizSongId = reveal?.quizSongId ?? null;
    room.gameStatus = 'ROUND_ENDED';

    if (room.speedModeEnabled) {
      room.currentRound.autoNextRoundAt = new Date(
        Date.now() + SPEED_MODE_NEXT_ROUND_DELAY_SECONDS * 1000,
      ).toISOString();
      await this.scheduleSpeedModeTimer(
        room.roomId,
        'speed-next',
        SPEED_MODE_NEXT_ROUND_DELAY_SECONDS,
      );
    }
  }

  /**
   * finalizeRoundEnd로 라운드를 끝내고 그 room 상태 저장(saveRoom)까지 성공한
   * 직후에만 호출한다. round-timeout과(스피드 모드면) speed-reveal은 이제 쓸모없는
   * 안전 타이머이므로 정리하지만, 어디까지나 best-effort 정리라 실패해도 예외를
   * 던지지 않는다 — 핵심 상태는 이미 저장됐으니, 정리에 실패해도 스테일 타이머가
   * 한 번 더 헛돌고 각자의 gameStatus 가드로 no-op 처리될 뿐이다.
   */
  private cleanupStaleRoundTimers(room: RoomItemDto): void {
    this.clearRoundTimer(room.roomId);
    if (room.speedModeEnabled) {
      this.roomTimerService.cancel('speed-reveal', room.roomId).catch((err) => {
        this.logger.warn(
          `스피드모드 타이머 취소 실패(speed-reveal, ${room.roomId}): ${(err as Error).message}`,
        );
      });
    }
  }

  /**
   * 스피드 모드 타이머를 예약한다. 예약(ZADD) 자체가 실패하면 호출자에게 그대로
   * 던진다 — 상태 저장만 성공하고 타이머는 유실되는 상황을 막기 위함이다
   * (RoomTimerService.schedule 참고). 'speed-reveal'과 'speed-next'가 같은 roomId에
   * 동시에 남아있을 위험은 예약 시점에 다른 kind를 미리 지우는 대신, 각 핸들러의
   * gameStatus 가드(PLAYING/ROUND_ENDED가 아니면 no-op)와 CAS 기반 자기 정리로
   * 감당한다 — finalizeRoundEnd 문서 참고.
   */
  private async scheduleSpeedModeTimer(
    roomId: string,
    kind: 'speed-reveal' | 'speed-next',
    delaySeconds: number,
  ): Promise<void> {
    try {
      await this.roomTimerService.schedule(kind, roomId, delaySeconds);
    } catch {
      throw new ServiceUnavailableException(
        '타이머 예약에 실패했습니다. 잠시 후 다시 시도해주세요.',
      );
    }
  }

  private clearSpeedModeTimer(roomId: string): void {
    this.roomTimerService.cancel('speed-reveal', roomId).catch((err) => {
      this.logger.warn(
        `스피드모드 타이머 취소 실패(speed-reveal, ${roomId}): ${(err as Error).message}`,
      );
    });
    this.roomTimerService.cancel('speed-next', roomId).catch((err) => {
      this.logger.warn(
        `스피드모드 타이머 취소 실패(speed-next, ${roomId}): ${(err as Error).message}`,
      );
    });
  }

  /**
   * 스피드 모드: 첫 정답자가 나온 뒤 예약된 시간이 지나면 아직 전원이 못 맞췄어도 정답을 공개한다.
   * 실패를 여기서 삼키지 않고 다시 던진다 — 이 메서드는 RoomTimerService가 등록한
   * 타이머 핸들러라, 삼키면 실패한 처리도 성공한 것으로 보고 예약을 지워버려(CAS
   * 삭제가 handler resolve만 보고 판단) 재시도 기회 자체가 사라진다.
   */
  private async handleSpeedModeReveal(roomId: string): Promise<void> {
    try {
      await this.withRoomLock(roomId, async () => {
        const room = await this.getRoomRecord(roomId);
        if (!room || room.gameStatus !== 'PLAYING') {
          return;
        }
        await this.finalizeRoundEnd(room);
        await this.saveRoom(room);
        this.cleanupStaleRoundTimers(room);
        this.emit('room-updated', this.toPublicRoom(room));
      });
    } catch (err) {
      this.logger.error(
        `스피드 모드 정답 자동 공개 처리 실패(roomId: ${roomId}), 재시도되도록 예약을 유지합니다: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  /**
   * 스피드 모드: 정답 공개 후 예약된 시간이 지나면 방장 조작 없이 자동으로 다음 라운드로 넘어간다.
   * handleSpeedModeReveal과 동일한 이유로 실패를 삼키지 않고 다시 던진다.
   */
  private async handleAutoNextRound(roomId: string): Promise<void> {
    try {
      await this.withRoomLock(roomId, async () => {
        const room = await this.getRoomRecord(roomId);
        if (!room || room.gameStatus !== 'ROUND_ENDED') {
          return;
        }
        await this.advanceToNextRound(room);
        await this.saveRoom(room);
        this.emit('room-updated', this.toPublicRoom(room));
      });
    } catch (err) {
      this.logger.error(
        `스피드 모드 자동 다음 라운드 처리 실패(roomId: ${roomId}), 재시도되도록 예약을 유지합니다: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  /** 다음 라운드를 준비하거나(있으면) 게임을 종료한다(없으면). room 객체를 직접 변경한다. */
  private async advanceToNextRound(room: RoomItemDto): Promise<void> {
    const roomId = room.roomId;
    const songOrder = await this.getSongOrder(roomId);
    const nextIndex = (room.currentRound?.roundIndex ?? -1) + 1;

    if (nextIndex >= songOrder.length) {
      room.gameStatus = 'FINISHED';
      room.currentRound = null;
      await Promise.all([
        this.deleteSongOrder(roomId),
        this.deleteRoundsSnapshot(roomId),
        this.deleteCurrentAnswers(roomId),
        this.deleteCurrentReveal(roomId),
      ]);
    } else {
      room.gameStatus = 'LOADING';
      room.currentRound = await this.prepareRoundData(
        roomId,
        songOrder[nextIndex],
        nextIndex,
        songOrder.length,
      );
    }
  }

  /**
   * 라운드 제한시간 타이머를 예약한다. RoomTimerService.schedule은 같은 kind+roomId면
   * score(발화 시각)만 덮어써 재예약이 곧 취소+재설정 효과를 내므로 별도로 먼저
   * 취소할 필요가 없다.
   * 예약(ZADD) 자체가 실패하면 호출자에게 그대로 던진다 — 상태 저장만 성공하고
   * 타이머는 유실되는 상황을 막기 위함이다(RoomTimerService.schedule 참고).
   */
  private async scheduleRoundTimer(
    roomId: string,
    delaySeconds: number,
  ): Promise<void> {
    try {
      await this.roomTimerService.schedule(
        'round-timeout',
        roomId,
        delaySeconds,
      );
    } catch {
      throw new ServiceUnavailableException(
        '타이머 예약에 실패했습니다. 잠시 후 다시 시도해주세요.',
      );
    }
  }

  private clearRoundTimer(roomId: string): void {
    this.roomTimerService.cancel('round-timeout', roomId).catch((err) => {
      this.logger.warn(
        `라운드 타이머 취소 실패(${roomId}): ${(err as Error).message}`,
      );
    });
  }

  private async handleRoundTimeout(roomId: string): Promise<void> {
    await this.withRoomLock(roomId, async () => {
      const room = await this.getRoomRecord(roomId);
      if (!room || room.gameStatus !== 'PLAYING') {
        return;
      }
      await this.finalizeRoundEnd(room);
      await this.saveRoom(room);
      this.cleanupStaleRoundTimers(room);
      this.emit('room-updated', this.toPublicRoom(room));
    });
  }

  private shuffle<T>(items: T[]): T[] {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  /**
   * 게임 시작 시 받아둔 라운드 스냅샷(setRoundsSnapshot)에서 이 라운드의 곡 데이터를
   * 읽어 currentAnswers/currentReveal 캐시를 채우고 공개 라운드 상태를 만든다. apps/api를
   * 다시 호출하지 않는다.
   */
  private async prepareRoundData(
    roomId: string,
    quizSongId: string,
    roundIndex: number,
    totalRounds: number,
  ): Promise<RoundPublicStateDto> {
    const snapshot = await this.getRoundsSnapshot(roomId);
    const roundData = snapshot[quizSongId];
    if (!roundData) {
      throw new NotFoundException(
        `출제곡을 찾을 수 없습니다. (quizSongId: ${quizSongId})`,
      );
    }

    await this.setCurrentAnswers(roomId, roundData.answers);
    await this.setCurrentReveal(roomId, {
      quizSongId: roundData.quizSongId,
      songNm: roundData.songNm,
      atstNm: roundData.atstNm,
      albmNm: roundData.albmNm,
    });

    return {
      roundIndex,
      totalRounds,
      youtubeVideoId: roundData.youtubeVideoId,
      startSec: roundData.startSec,
      endSec: roundData.endSec,
      readyUserIds: [],
      correctUserIds: [],
      skipUserIds: [],
      forceSkipAt: null,
      autoRevealAt: null,
      autoNextRoundAt: null,
      playScheduledAt: null,
      revealed: false,
      songNm: null,
      atstNm: null,
      albmNm: null,
      quizSongId: null,
    };
  }

  /** pwdHash를 포함한 내부 표현을 반환한다. 응답/브로드캐스트 직전에는 반드시 toPublicRoom을 거쳐야 한다. */
  /**
   * 캐시에서 읽은 값을 그대로 신뢰하지 않고, 배포 전에 만들어진(비공개방/비밀방 기능
   * 추가 이전) 방 데이터에 없는 필드를 기본값으로 보정한다. 보정하지 않으면 이런 방을
   * 수정할 때 클라이언트가 undefined를 보내 @IsBoolean() 검증에서 400이 발생한다.
   */
  private async getRoomRecord(roomId: string): Promise<RoomRecord | undefined> {
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

  private async getRoomOrThrow(roomId: string): Promise<RoomRecord> {
    const room = await this.getRoomRecord(roomId);
    if (!room) {
      throw new NotFoundException(`방을 찾을 수 없습니다. (roomId: ${roomId})`);
    }
    return room;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private toPublicRoom({ pwdHash, ...publicRoom }: RoomRecord): RoomItemDto {
    return publicRoom;
  }

  /**
   * room 상태는 여러 인스턴스가 공유하는 핵심 데이터라 cacheService.set()의 "Redis
   * 실패 시 로컬로 조용히 폴백" 동작을 쓰면 안 된다 — 폴백하면 이 인스턴스에서는
   * 성공한 것처럼 보이지만 실제 공유 Redis에는 반영되지 않아, 이미 Redis에 반영된
   * 타이머 예약(RoomTimerService) 등과 어긋나는 조용한 정합성 문제로 이어진다.
   * setStrict는 실패를 그대로 던지므로 호출자(withRoomLock 내부)가 상태 저장
   * 실패를 알아채고 이후 정리(cleanupStaleRoundTimers 등)를 건너뛸 수 있다.
   */
  private async saveRoom(room: RoomItemDto): Promise<void> {
    await this.cacheService.setStrict(
      this.roomKey(room.roomId),
      room,
      ROOM_TTL_SECONDS,
    );
  }

  private async deleteRoom(roomId: string): Promise<void> {
    await this.cacheService.del(this.roomKey(roomId));
    await this.removeFromIndex(roomId);
    this.clearRoundTimer(roomId);
    this.clearSpeedModeTimer(roomId);
    await Promise.all([
      this.deleteSongOrder(roomId),
      this.deleteRoundsSnapshot(roomId),
      this.deleteCurrentAnswers(roomId),
      this.deleteCurrentReveal(roomId),
      this.cacheService.del(this.chatHistoryKey(roomId)),
    ]);
    this.chatHistory.delete(roomId);
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
  private async getSongOrder(roomId: string): Promise<string[]> {
    return (
      (await this.cacheService.getStrict<string[]>(
        this.songOrderKey(roomId),
      )) ?? []
    );
  }

  private async setSongOrder(
    roomId: string,
    songOrder: string[],
  ): Promise<void> {
    await this.cacheService.setStrict(
      this.songOrderKey(roomId),
      songOrder,
      ROOM_TTL_SECONDS,
    );
  }

  private async deleteSongOrder(roomId: string): Promise<void> {
    await this.cacheService.del(this.songOrderKey(roomId));
  }

  private songOrderKey(roomId: string): string {
    return `${SONG_ORDER_CACHE_KEY_PREFIX}${roomId}`;
  }

  private async getRoundsSnapshot(
    roomId: string,
  ): Promise<Record<string, QuizRoundData>> {
    return (
      (await this.cacheService.getStrict<Record<string, QuizRoundData>>(
        this.roundsSnapshotKey(roomId),
      )) ?? {}
    );
  }

  private async setRoundsSnapshot(
    roomId: string,
    snapshot: Record<string, QuizRoundData>,
  ): Promise<void> {
    await this.cacheService.setStrict(
      this.roundsSnapshotKey(roomId),
      snapshot,
      ROOM_TTL_SECONDS,
    );
  }

  private async deleteRoundsSnapshot(roomId: string): Promise<void> {
    await this.cacheService.del(this.roundsSnapshotKey(roomId));
  }

  private roundsSnapshotKey(roomId: string): string {
    return `${ROUNDS_SNAPSHOT_CACHE_KEY_PREFIX}${roomId}`;
  }

  private async getCurrentAnswers(roomId: string): Promise<string[]> {
    return (
      (await this.cacheService.getStrict<string[]>(
        this.currentAnswersKey(roomId),
      )) ?? []
    );
  }

  private async setCurrentAnswers(
    roomId: string,
    answers: string[],
  ): Promise<void> {
    await this.cacheService.setStrict(
      this.currentAnswersKey(roomId),
      answers,
      ROOM_TTL_SECONDS,
    );
  }

  private async deleteCurrentAnswers(roomId: string): Promise<void> {
    await this.cacheService.del(this.currentAnswersKey(roomId));
  }

  private currentAnswersKey(roomId: string): string {
    return `${CURRENT_ANSWERS_CACHE_KEY_PREFIX}${roomId}`;
  }

  private async getCurrentReveal(
    roomId: string,
  ): Promise<
    | { quizSongId: string; songNm: string; atstNm: string; albmNm: string }
    | undefined
  > {
    return this.cacheService.getStrict(this.currentRevealKey(roomId));
  }

  private async setCurrentReveal(
    roomId: string,
    reveal: {
      quizSongId: string;
      songNm: string;
      atstNm: string;
      albmNm: string;
    },
  ): Promise<void> {
    await this.cacheService.setStrict(
      this.currentRevealKey(roomId),
      reveal,
      ROOM_TTL_SECONDS,
    );
  }

  private async deleteCurrentReveal(roomId: string): Promise<void> {
    await this.cacheService.del(this.currentRevealKey(roomId));
  }

  private currentRevealKey(roomId: string): string {
    return `${CURRENT_REVEAL_CACHE_KEY_PREFIX}${roomId}`;
  }

  /**
   * 참가자 접근 토큰은 상태를 저장하지 않고 roomId+userId로부터 결정적으로
   * 계산한다(HMAC 서명). 무작위로 발급해 in-memory Map에 저장하는 방식은:
   * - 프로세스가 재시작되면(배포 등) 방 데이터는 Redis에 그대로 남아있는데
   *   토큰만 전부 사라져, 재시작 이전에 입장한 참가자는 소켓에 다시 들어올 수
   *   없게 된다.
   * - 여러 인스턴스로 확장하면 발급한 인스턴스와 검증하는 인스턴스가 달라
   *   실패할 수 있다.
   * - 같은 계정이 다른 기기로 재입장하면 토큰을 다시 발급(덮어쓰기)하므로
   *   기존 기기의 토큰이 무효화된다.
   * 결정적 서명 방식은 이 세 가지를 모두 해결한다. USER_JWT_SECRET은 apps/api의
   * 로그인 JWT 서명과 같은 값을 그대로 공유해서 쓴다 — 계정 JWT를 검증하는 게
   * 아니라 HMAC 키로만 재사용하는 것이라, apps/api의 User 도메인에 직접
   * 결합되지는 않는다.
   */
  private computeMembershipToken(roomId: string, userId: string): string {
    return createHmac('sha256', `${process.env.USER_JWT_SECRET}:room-access`)
      .update(`${roomId}:${userId}`)
      .digest('hex');
  }

  /** 소켓 room:enter, REST 퇴장 요청에서 요청자가 실제 그 참가자 본인인지 검증한다. */
  verifyMembershipToken(
    roomId: string,
    userId: string,
    token: string,
  ): boolean {
    const expected = Buffer.from(this.computeMembershipToken(roomId, userId));
    const actual = Buffer.from(token);
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  }

  private passwordAttemptKey(
    roomId: string,
    clientIp: string | undefined,
  ): string {
    return `${PASSWORD_ATTEMPT_CACHE_KEY_PREFIX}${roomId}:${clientIp ?? 'unknown'}`;
  }

  /** 이 방+IP 조합의 최근 실패 횟수가 한도를 넘었으면 429를 던진다(비밀번호 확인 전에 먼저 확인). */
  private async assertPasswordAttemptAllowed(
    roomId: string,
    clientIp: string | undefined,
  ): Promise<void> {
    const key = this.passwordAttemptKey(roomId, clientIp);
    const attempts = (await this.cacheService.get<number>(key)) ?? 0;
    if (attempts >= PASSWORD_ATTEMPT_LIMIT) {
      throw new HttpException(
        '비밀번호 시도 횟수를 초과했습니다. 잠시 후 다시 시도해주세요.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /** 비밀번호가 틀렸을 때만 호출한다. 성공한 시도나 공개방 입장은 집계하지 않는다. */
  private async recordFailedPasswordAttempt(
    roomId: string,
    clientIp: string | undefined,
  ): Promise<void> {
    const key = this.passwordAttemptKey(roomId, clientIp);
    const attempts = ((await this.cacheService.get<number>(key)) ?? 0) + 1;
    await this.cacheService.set(key, attempts, PASSWORD_ATTEMPT_WINDOW_SECONDS);
  }

  private async clearPasswordAttempts(
    roomId: string,
    clientIp: string | undefined,
  ): Promise<void> {
    await this.cacheService.del(this.passwordAttemptKey(roomId, clientIp));
  }

  private async getRoomIndex(): Promise<string[]> {
    return (await this.cacheService.get<string[]>(ROOM_INDEX_CACHE_KEY)) ?? [];
  }

  /**
   * room:index는 여러 인스턴스가 동시에 건드릴 수 있는 read-modify-write라, roomId별
   * 락(withRoomLock)과 별개로 인덱스 전용 락으로 직렬화해야 두 인스턴스가 동시에
   * 방을 만들거나 지워도 마지막 쓰기가 상대방의 변경을 덮어쓰지 않는다.
   */
  private async addToIndex(roomId: string): Promise<void> {
    await this.roomLockService.withLock(ROOM_INDEX_LOCK_KEY, async () => {
      const index = await this.getRoomIndex();
      index.push(roomId);
      await this.cacheService.set(
        ROOM_INDEX_CACHE_KEY,
        index,
        ROOM_TTL_SECONDS,
      );
    });
  }

  private async removeFromIndex(roomId: string): Promise<void> {
    await this.roomLockService.withLock(ROOM_INDEX_LOCK_KEY, async () => {
      const index = await this.getRoomIndex();
      await this.cacheService.set(
        ROOM_INDEX_CACHE_KEY,
        index.filter((id) => id !== roomId),
        ROOM_TTL_SECONDS,
      );
    });
  }

  /**
   * 같은 roomId에 대한 작업을 도착한 순서대로 하나씩 실행되도록 직렬화한다.
   * REDIS_HOST가 설정돼 있으면 인스턴스 간에도 직렬화되는 분산 락(RoomLockService)을,
   * 아니면 프로세스 내 Promise 체이닝을 쓴다.
   */
  private async withRoomLock<T>(
    roomId: string,
    task: () => Promise<T>,
  ): Promise<T> {
    return this.roomLockService.withLock(`room:${roomId}`, task);
  }
}
