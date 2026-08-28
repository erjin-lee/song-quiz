import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { EventEmitter } from 'events';
import * as bcrypt from 'bcrypt';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { updateLogContext } from 'logger';
import { QuizClient } from './clients/quiz.client';
import { CreateRoomRequestDto } from './dto/create-room-request.dto';
import { JoinRoomRequestDto } from './dto/join-room-request.dto';
import { LeaveRoomResultDto } from './dto/leave-room-result.dto';
import { RoomItemDto } from './dto/room-item.dto';
import { RoomJoinResultDto } from './dto/room-join-result.dto';
import { UpdateRoomRequestDto } from './dto/update-room-request.dto';
import { normalizeAnswer, pointsForRank } from './game-scoring.util';
import {
  ChatHistoryEntry,
  roomLockKey,
  RoomRecord,
  RoomRepository,
} from './room.repository';
import { RoomLockService } from './room-lock.service';
import { RoomRoundService } from './room-round.service';
import { RoomTimerService } from './room-timer.service';

const BCRYPT_SALT_ROUNDS = 10;
/** 방장이 강제 스킵을 요청한 뒤 실제로 라운드가 종료되기까지의 유예 시간. */
const FORCE_SKIP_DELAY_SECONDS = 3;
/** 스피드 모드에서 첫 정답자가 나온 뒤 정답을 자동 공개하기까지의 유예 시간. */
const SPEED_MODE_REVEAL_DELAY_SECONDS = Number(
  process.env.SPEED_MODE_REVEAL_DELAY_SECONDS ?? 6,
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
 * 방/게임 상태가 바뀔 때마다 'room-updated' 이벤트로 최신 RoomItemDto를 전파한다.
 * RoomGateway가 구독해 소켓으로 브로드캐스트한다(REST 변경도 즉시 소켓에 반영됨).
 */
@Injectable()
export class RoomService extends EventEmitter {
  private readonly logger = new Logger(RoomService.name);

  constructor(
    private readonly roomRepository: RoomRepository,
    private readonly roomRoundService: RoomRoundService,
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
    const roomIds = await this.roomRepository.getRoomIndex();
    const records = await Promise.all(
      roomIds.map((roomId) => this.roomRepository.getRoomRecord(roomId)),
    );

    const staleRoomIds = roomIds.filter((_, i) => records[i] === undefined);
    if (staleRoomIds.length > 0) {
      this.pruneStaleIndexEntries(staleRoomIds);
    }

    const publicRooms = records
      .filter(
        (room): room is RoomRecord => room !== undefined && !room.isUnlisted,
      )
      .map((room) => this.roomRepository.toPublicRoom(room));

    if (page === undefined || pageSize === undefined) {
      return publicRooms;
    }

    const start = (page - 1) * pageSize;
    return publicRooms.slice(start, start + pageSize);
  }

  /**
   * room:index는 이제 만료시키지 않으므로(ROOM_INDEX_TTL_SECONDS), 방이 TTL로
   * 자연 만료돼 removeFromIndex를 못 탄 stale entry는 여기서만 정리된다. 목록
   * 조회 응답을 늦추지 않도록 기다리지 않고(fire-and-forget) 백그라운드에서
   * 지운다 — 실패해도 다음 조회에서 다시 시도되므로 결국 정리된다.
   */
  private pruneStaleIndexEntries(roomIds: string[]): void {
    for (const roomId of roomIds) {
      this.reconcileStaleIndexEntry(roomId).catch((err) => {
        this.logger.warn(
          `만료된 방을 room:index에서 정리하지 못했습니다(roomId: ${roomId}): ${(err as Error).message}`,
        );
      });
    }
  }

  /**
   * getRooms()가 쓰는 getRoomRecord()는 Redis 오류 시 로컬 폴백으로 undefined를 반환할
   * 수 있다(목록 표시용으로는 안전하지만, 그 결과만으로 index에서 지우면 일시적인 Redis
   * 오류를 "방 만료"로 오인해 살아있는 방을 영구히 목록에서 지울 수 있다). 그래서 지우기
   * 전에 폴백 없는 roomExistsStrict로 한 번 더 확인한다 — 이 확인 자체가 실패하면(Redis
   * 오류) 판단을 유보하고 지우지 않는다(다음 조회에서 다시 시도).
   *
   * roomExistsStrict 확인과 removeFromIndex 사이에 room lock이 없으면, 그 틈에 다른
   * 작업(예: joinRoom)이 이미 이 roomId의 락을 쥔 채 방을 다시 저장(TTL 갱신)해도
   * 우리는 "없었다"는 낡은 판단으로 그 방을 index에서 지워버릴 수 있다. deleteRoom과
   * 동일하게 room lock으로 확인·삭제를 하나의 임계구역으로 묶어, 그 사이에는 어떤
   * saveRoom도 끼어들 수 없게 한다.
   */
  private async reconcileStaleIndexEntry(roomId: string): Promise<void> {
    await this.withRoomLock(roomId, async () => {
      const stillExists = await this.roomRepository.roomExistsStrict(roomId);
      if (stillExists) {
        return;
      }
      await this.roomRepository.removeFromIndex(roomId);
    });
  }

  async getRoom(roomId: string): Promise<RoomItemDto | undefined> {
    const record = await this.roomRepository.getRoomRecord(roomId);
    return record ? this.roomRepository.toPublicRoom(record) : undefined;
  }

  async createRoom(
    dto: CreateRoomRequestDto,
    accountUserId?: string,
    clientIp?: string,
  ): Promise<RoomJoinResultDto> {
    await this.roomRepository.assertRoomCreationAllowed(clientIp);

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

    await this.roomRepository.saveRoom(room);
    try {
      await this.roomRepository.addToIndex(room.roomId);
    } catch (err) {
      // index 등록에 실패한 채로 두면 아무도 모르는(응답도 못 받은) orphan room이
      // Redis에 남는다. 방 본체를 되돌려 orphan을 남기지 않는다.
      await this.roomRepository.deleteRoomRecord(room.roomId).catch(() => {
        this.logger.error(
          `방 생성 롤백 실패(roomId: ${room.roomId}): index 등록 실패 후 방 레코드 정리도 실패했습니다.`,
        );
      });
      throw err;
    }

    updateLogContext({ roomId: room.roomId });
    this.logger.log(
      `방 생성됨(roomId: ${room.roomId}, quizId: ${dto.quizId})`,
      {
        event: 'room_created',
      },
    );

    const accessToken = this.computeMembershipToken(room.roomId, hostUserId);
    return {
      room: this.roomRepository.toPublicRoom(room),
      userId: hostUserId,
      accessToken,
    };
  }

  async joinRoom(
    roomId: string,
    dto: JoinRoomRequestDto,
    accountUserId?: string,
    clientIp?: string,
  ): Promise<RoomJoinResultDto> {
    return this.withRoomLock(roomId, async () => {
      const room = await this.roomRepository.getRoomOrThrow(roomId);

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
            room: this.roomRepository.toPublicRoom(room),
            userId: existing.userId,
            accessToken,
          };
        }
      }

      if (room.curUserCnt >= room.maxUserCnt) {
        throw new ConflictException('방 정원이 가득 찼습니다.');
      }

      if (room.isPrivate) {
        await this.roomRepository.assertPasswordAttemptAllowed(
          roomId,
          clientIp,
        );

        const matches =
          room.pwdHash !== null &&
          (await bcrypt.compare(dto.password ?? '', room.pwdHash));
        if (!matches) {
          await this.roomRepository.recordFailedPasswordAttempt(
            roomId,
            clientIp,
          );
          throw new UnauthorizedException('비밀번호가 올바르지 않습니다.');
        }
        await this.roomRepository.clearPasswordAttempts(roomId, clientIp);
      }

      const userId = accountUserId ?? randomUUID();
      room.participants.push({
        userId,
        nickname: dto.nickname,
        score: 0,
        isAccount: Boolean(accountUserId),
      });
      room.curUserCnt = room.participants.length;

      await this.roomRepository.saveRoom(room);
      this.emit('room-updated', this.roomRepository.toPublicRoom(room));
      this.emit('participant-joined', {
        roomId,
        userId,
        nickname: dto.nickname,
      });

      const accessToken = this.computeMembershipToken(roomId, userId);
      return {
        room: this.roomRepository.toPublicRoom(room),
        userId,
        accessToken,
      };
    });
  }

  async leaveRoom(roomId: string, userId: string): Promise<LeaveRoomResultDto> {
    return this.withRoomLock(roomId, async () => {
      const room = await this.roomRepository.getRoomOrThrow(roomId);

      const participantIndex = room.participants.findIndex(
        (participant) => participant.userId === userId,
      );
      if (participantIndex === -1) {
        throw new NotFoundException('방에 참가 중인 유저가 아닙니다.');
      }

      room.participants.splice(participantIndex, 1);
      room.curUserCnt = room.participants.length;

      updateLogContext({ roomId, userId });
      this.logger.log(`참가자 퇴장(roomId: ${roomId}, userId: ${userId})`, {
        event: 'player_left',
      });

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
        await this.roomRoundService.recomputeReadyStatus(room);
      } else if (room.gameStatus === 'PLAYING' && room.currentRound) {
        const allAnswered = room.participants.every((participant) =>
          room.currentRound!.correctUserIds.includes(participant.userId),
        );
        if (allAnswered || this.roomRoundService.hasSkipMajority(room)) {
          await this.roomRoundService.finalizeRoundEnd(room);
          roundEnded = true;
        }
      }

      await this.roomRepository.saveRoom(room);
      if (roundEnded) {
        this.roomRoundService.cleanupStaleRoundTimers(room);
      }
      this.emit('room-updated', this.roomRepository.toPublicRoom(room));

      return {
        roomDeleted: false,
        room: this.roomRepository.toPublicRoom(room),
      };
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
      const room = await this.roomRepository.getRoomOrThrow(roomId);
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
        return this.roomRepository.toPublicRoom(room);
      }

      participant.nickname = nickname;
      await this.roomRepository.saveRoom(room);

      const publicRoom = this.roomRepository.toPublicRoom(room);
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
      const room = await this.roomRepository.getRoomOrThrow(roomId);
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

      await this.roomRepository.saveRoom(room);
      const publicRoom = this.roomRepository.toPublicRoom(room);
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
      const room = await this.roomRepository.getRoomOrThrow(roomId);
      this.assertHost(room, requesterUserId);

      if (room.gameStatus !== 'WAITING') {
        throw new ConflictException('이미 시작되었거나 진행 중인 게임입니다.');
      }

      await this.roomRoundService.prepareFirstRound(roomId, room);

      await this.roomRepository.saveRoom(room);
      updateLogContext({ roomId });
      this.logger.log(`게임 시작됨(roomId: ${roomId})`, {
        event: 'game_started',
      });
      this.emit('room-updated', this.roomRepository.toPublicRoom(room));
      return room;
    });
  }

  /** 방장이 종료된 게임을 같은 방/설정으로 다시 시작한다. 점수를 초기화하고 첫 라운드부터 다시 준비한다. */
  async restartGame(
    roomId: string,
    requesterUserId: string,
  ): Promise<RoomItemDto> {
    return this.withRoomLock(roomId, async () => {
      const room = await this.roomRepository.getRoomOrThrow(roomId);
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

      await this.roomRoundService.prepareFirstRound(roomId, room);

      await this.roomRepository.saveRoom(room);
      updateLogContext({ roomId });
      this.logger.log(`게임 재시작됨(roomId: ${roomId})`, {
        event: 'game_started',
      });
      this.emit('room-updated', this.roomRepository.toPublicRoom(room));
      return room;
    });
  }

  /** 참가자가 현재 라운드 영상 로딩을 마쳤음을 알린다. */
  async markReady(roomId: string, userId: string): Promise<RoomItemDto> {
    return this.withRoomLock(roomId, async () => {
      const room = await this.roomRepository.getRoomOrThrow(roomId);
      const round = room.currentRound;

      if (!round || room.gameStatus !== 'LOADING') {
        return room;
      }

      if (!round.readyUserIds.includes(userId)) {
        round.readyUserIds.push(userId);
      }
      await this.roomRoundService.recomputeReadyStatus(room);

      await this.roomRepository.saveRoom(room);
      this.emit('room-updated', this.roomRepository.toPublicRoom(room));
      return room;
    });
  }

  /** 방장이 라운드 종료 후 다음 라운드로 넘어간다(또는 마지막 라운드면 게임을 종료한다). */
  async nextRound(
    roomId: string,
    requesterUserId: string,
  ): Promise<RoomItemDto> {
    return this.withRoomLock(roomId, async () => {
      const room = await this.roomRepository.getRoomOrThrow(roomId);
      this.assertHost(room, requesterUserId);

      if (room.gameStatus !== 'ROUND_ENDED') {
        throw new ConflictException('아직 라운드가 끝나지 않았습니다.');
      }

      this.roomRoundService.clearSpeedModeTimer(roomId);
      await this.roomRoundService.advanceToNextRound(room);

      await this.roomRepository.saveRoom(room);
      this.emit('room-updated', this.roomRepository.toPublicRoom(room));
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
      const room = await this.roomRepository.getRoomOrThrow(roomId);
      const round = room.currentRound;
      const nickname = room.participants.find(
        (p) => p.userId === userId,
      )?.nickname;

      if (!round || round.revealed) {
        return { action: 'broadcast', nickname };
      }

      const answers = (
        await this.roomRepository.getCurrentAnswers(roomId)
      ).filter((answer) => normalizeAnswer(answer).length > 0);
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
        await this.roomRoundService.finalizeRoundEnd(room);
        roundEnded = true;
      } else if (room.speedModeEnabled && round.correctUserIds.length === 1) {
        round.autoRevealAt = new Date(
          Date.now() + SPEED_MODE_REVEAL_DELAY_SECONDS * 1000,
        ).toISOString();
        await this.roomRoundService.scheduleSpeedModeTimer(
          roomId,
          'speed-reveal',
          SPEED_MODE_REVEAL_DELAY_SECONDS,
        );
      }

      await this.roomRepository.saveRoom(room);
      if (roundEnded) {
        this.roomRoundService.cleanupStaleRoundTimers(room);
      }
      this.emit('room-updated', this.roomRepository.toPublicRoom(room));

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
      const room = await this.roomRepository.getRoomOrThrow(roomId);
      const round = room.currentRound;

      if (!round || room.gameStatus !== 'PLAYING') {
        return room;
      }

      if (!round.skipUserIds.includes(userId)) {
        round.skipUserIds.push(userId);
      }

      const roundEnded = this.roomRoundService.hasSkipMajority(room);
      if (roundEnded) {
        await this.roomRoundService.finalizeRoundEnd(room);
      }

      await this.roomRepository.saveRoom(room);
      if (roundEnded) {
        this.roomRoundService.cleanupStaleRoundTimers(room);
      }
      this.emit('room-updated', this.roomRepository.toPublicRoom(room));
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
      const room = await this.roomRepository.getRoomOrThrow(roomId);
      this.assertHost(room, requesterUserId);

      const round = room.currentRound;
      if (!round || room.gameStatus !== 'PLAYING') {
        throw new ConflictException('지금은 강제 스킵을 요청할 수 없습니다.');
      }

      round.forceSkipAt = new Date(
        Date.now() + FORCE_SKIP_DELAY_SECONDS * 1000,
      ).toISOString();
      await this.roomRoundService.scheduleRoundTimer(
        roomId,
        FORCE_SKIP_DELAY_SECONDS,
      );

      await this.roomRepository.saveRoom(room);
      this.emit('room-updated', this.roomRepository.toPublicRoom(room));
      return room;
    });
  }

  /** 채팅/시스템 메시지를 히스토리에 기록한다(재접속 시 복원용). 저장 방식은 RoomRepository 참고. */
  async appendChatHistory(
    roomId: string,
    entry: ChatHistoryEntry,
  ): Promise<void> {
    return this.roomRepository.appendChatHistory(roomId, entry);
  }

  /** roomId의 채팅 히스토리를 조회한다(재접속 시 복원용). */
  async getChatHistory(roomId: string): Promise<ChatHistoryEntry[]> {
    return this.roomRepository.getChatHistory(roomId);
  }

  private assertHost(room: RoomItemDto, requesterUserId: string): void {
    if (room.hostUserId !== requesterUserId) {
      throw new ForbiddenException('방장만 할 수 있는 작업입니다.');
    }
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
        const room = await this.roomRepository.getRoomRecord(roomId);
        if (!room || room.gameStatus !== 'PLAYING') {
          return;
        }
        await this.roomRoundService.finalizeRoundEnd(room);
        await this.roomRepository.saveRoom(room);
        this.roomRoundService.cleanupStaleRoundTimers(room);
        this.emit('room-updated', this.roomRepository.toPublicRoom(room));
      });
    } catch (err) {
      updateLogContext({ roomId });
      this.logger.error(
        `스피드 모드 정답 자동 공개 처리 실패(roomId: ${roomId}), 재시도되도록 예약을 유지합니다: ${(err as Error).message}`,
        { event: 'game_state_error' },
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
        const room = await this.roomRepository.getRoomRecord(roomId);
        if (!room || room.gameStatus !== 'ROUND_ENDED') {
          return;
        }
        await this.roomRoundService.advanceToNextRound(room);
        await this.roomRepository.saveRoom(room);
        this.emit('room-updated', this.roomRepository.toPublicRoom(room));
      });
    } catch (err) {
      updateLogContext({ roomId });
      this.logger.error(
        `스피드 모드 자동 다음 라운드 처리 실패(roomId: ${roomId}), 재시도되도록 예약을 유지합니다: ${(err as Error).message}`,
        { event: 'game_state_error' },
      );
      throw err;
    }
  }

  private async handleRoundTimeout(roomId: string): Promise<void> {
    await this.withRoomLock(roomId, async () => {
      const room = await this.roomRepository.getRoomRecord(roomId);
      if (!room || room.gameStatus !== 'PLAYING') {
        return;
      }
      await this.roomRoundService.finalizeRoundEnd(room);
      await this.roomRepository.saveRoom(room);
      this.roomRoundService.cleanupStaleRoundTimers(room);
      this.emit('room-updated', this.roomRepository.toPublicRoom(room));
    });
  }

  private async deleteRoom(roomId: string): Promise<void> {
    await this.roomRepository.deleteRoomRecord(roomId);
    // index 정리 실패로 "방은 이미 지워졌는데 삭제 요청 자체가 실패한 것처럼" 보이면
    // 안 되므로 best-effort로만 처리한다. 남는 stale entry는 getRooms 조회 시점에
    // pruneStaleIndexEntries가 정리한다.
    await this.roomRepository.removeFromIndex(roomId).catch((err) => {
      this.logger.warn(
        `방 삭제 후 room:index 정리 실패(roomId: ${roomId}), 다음 목록 조회 시 정리됩니다: ${(err as Error).message}`,
      );
    });
    this.roomRoundService.clearRoundTimer(roomId);
    this.roomRoundService.clearSpeedModeTimer(roomId);
    await Promise.all([
      this.roomRepository.deleteSongOrder(roomId),
      this.roomRepository.deleteRoundsSnapshot(roomId),
      this.roomRepository.deleteCurrentAnswers(roomId),
      this.roomRepository.deleteCurrentReveal(roomId),
      this.roomRepository.deleteChatHistory(roomId),
    ]);
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

  /**
   * 같은 roomId에 대한 작업을 도착한 순서대로 하나씩 실행되도록 직렬화한다.
   * REDIS_HOST가 설정돼 있으면 인스턴스 간에도 직렬화되는 분산 락(RoomLockService)을,
   * 아니면 프로세스 내 Promise 체이닝을 쓴다.
   */
  private async withRoomLock<T>(
    roomId: string,
    task: () => Promise<T>,
  ): Promise<T> {
    return this.roomLockService.withLock(roomLockKey(roomId), task);
  }
}
