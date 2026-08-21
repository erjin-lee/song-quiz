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
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CacheService } from '../cache/cache.service';
import { QuizAnswer } from '../quiz/entities/quiz-answer.entity';
import { QuizArtist } from '../quiz/entities/quiz-artist.entity';
import { QuizSong } from '../quiz/entities/quiz-song.entity';
import { Quiz } from '../quiz/entities/quiz.entity';
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

interface RoundRevealInfo {
  quizSongId: string;
  songNm: string;
  atstNm: string;
  albmNm: string;
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
    @InjectRepository(Quiz)
    private readonly quizRepository: Repository<Quiz>,
    @InjectRepository(QuizArtist)
    private readonly quizArtistRepository: Repository<QuizArtist>,
    @InjectRepository(QuizSong)
    private readonly quizSongRepository: Repository<QuizSong>,
    @InjectRepository(QuizAnswer)
    private readonly quizAnswerRepository: Repository<QuizAnswer>,
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

  async getRooms(): Promise<RoomItemDto[]> {
    const roomIds = await this.getRoomIndex();
    const records = await Promise.all(
      roomIds.map((roomId) => this.getRoomRecord(roomId)),
    );

    return records
      .filter(
        (room): room is RoomRecord => room !== undefined && !room.isUnlisted,
      )
      .map((room) => this.toPublicRoom(room));
  }

  async getRoom(roomId: string): Promise<RoomItemDto | undefined> {
    const record = await this.getRoomRecord(roomId);
    return record ? this.toPublicRoom(record) : undefined;
  }

  async createRoom(
    dto: CreateRoomRequestDto,
    accountUserId?: string,
  ): Promise<RoomJoinResultDto> {
    const quiz = await this.quizRepository.findOne({
      where: { quizId: dto.quizId, useYn: 'Y' },
    });
    if (!quiz) {
      throw new NotFoundException(
        `퀴즈를 찾을 수 없습니다. (quizId: ${dto.quizId})`,
      );
    }

    const quizArtists = await this.quizArtistRepository.find({
      where: { quizId: dto.quizId },
      relations: { artist: true },
    });
    const songCount = await this.quizSongRepository.count({
      where: { quizId: dto.quizId },
    });

    const songLimit = dto.songLimit ?? songCount;
    if (songLimit > songCount) {
      throw new BadRequestException(
        `출제곡 수는 퀴즈 전체 출제곡 수(${songCount}곡)를 초과할 수 없습니다.`,
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
      quizTtl: quiz.quizTtl,
      quizDesc: quiz.quizDesc,
      songCount,
      songLimit,
      quizThumbImgUrl: quiz.thumbImgUrl,
      atstIds: quizArtists.map((quizArtist) => quizArtist.atstId),
      atstNms: quizArtists.map((quizArtist) => quizArtist.artist.atstNm),
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

      if (room.gameStatus === 'LOADING') {
        await this.recomputeReadyStatus(room);
      } else if (room.gameStatus === 'PLAYING' && room.currentRound) {
        const allAnswered = room.participants.every((participant) =>
          room.currentRound!.correctUserIds.includes(participant.userId),
        );
        if (allAnswered || this.hasSkipMajority(room)) {
          await this.finalizeRoundEnd(room);
        }
      }

      await this.saveRoom(room);
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

      const quiz = await this.quizRepository.findOne({
        where: { quizId: dto.quizId, useYn: 'Y' },
      });
      if (!quiz) {
        throw new NotFoundException(
          `퀴즈를 찾을 수 없습니다. (quizId: ${dto.quizId})`,
        );
      }
      const quizArtists = await this.quizArtistRepository.find({
        where: { quizId: dto.quizId },
        relations: { artist: true },
      });
      const songCount = await this.quizSongRepository.count({
        where: { quizId: dto.quizId },
      });
      const songLimit = dto.songLimit ?? songCount;
      if (songLimit > songCount) {
        throw new BadRequestException(
          `출제곡 수는 퀴즈 전체 출제곡 수(${songCount}곡)를 초과할 수 없습니다.`,
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
      room.quizTtl = quiz.quizTtl;
      room.quizDesc = quiz.quizDesc;
      room.quizThumbImgUrl = quiz.thumbImgUrl;
      room.atstIds = quizArtists.map((quizArtist) => quizArtist.atstId);
      room.atstNms = quizArtists.map((quizArtist) => quizArtist.artist.atstNm);
      room.songCount = songCount;
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

  /** songOrder를 새로 구성하고 첫 라운드를 준비해 room을 LOADING 상태로 만든다(room을 직접 변경한다). */
  private async prepareFirstRound(
    roomId: string,
    room: RoomItemDto,
  ): Promise<void> {
    const songOrder = await this.buildSongOrder(
      room.quizId,
      room.isRandom,
      room.songLimit,
    );
    if (songOrder.length === 0) {
      throw new NotFoundException('퀴즈에 출제곡이 없습니다.');
    }

    await this.quizRepository.increment({ quizId: room.quizId }, 'playCnt', 1);

    await this.setSongOrder(roomId, songOrder);
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
      if (allAnswered) {
        await this.finalizeRoundEnd(room);
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

      if (this.hasSkipMajority(room)) {
        await this.finalizeRoundEnd(room);
      }

      await this.saveRoom(room);
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
   * 라운드를 종료(정답 공개)한다. 타임아웃/강제스킵/스킵과반/전원정답 등 어떤 경로로
   * 호출되든 이 함수 하나로 모이므로, 스피드 모드의 "공개 후 자동 다음 라운드" 예약도
   * 여기서 일괄 처리한다.
   * round-timeout 취소는 맨 마지막에 한다. 이 함수는 round-timeout 핸들러
   * (handleRoundTimeout) 자신이 호출하는 경로도 있는데, 맨 앞에서 먼저 취소해버리면
   * 그 뒤(예: speed-next 예약)에서 실패했을 때 자기 자신의 claim만 지운 채 아무
   * 타이머도 남지 않는다. 발화 중인 타이머 자신의 claim은 이 명시적 취소가 없어도
   * 핸들러가 정상 종료되면 RoomTimerService(fireClaimed)의 CAS 삭제가 정리하므로,
   * 나머지 처리가 전부 성공한 뒤에만 정리해도 안전하다.
   */
  private async finalizeRoundEnd(room: RoomItemDto): Promise<void> {
    if (!room.currentRound) {
      this.clearRoundTimer(room.roomId);
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

    this.clearRoundTimer(room.roomId);
  }

  /**
   * 스피드 모드 타이머를 예약한다. 'speed-reveal'/'speed-next'는 RoomTimerService에서
   * 서로 다른 예약(member)이라 자동으로 대체되지 않으므로, 기존에 한 슬롯만 쓰던
   * "두 단계가 동시에 존재하지 않는다"는 불변식을 유지하려면 다른 kind를 취소해야
   * 한다 — 단, 반드시 새 예약이 성공한 "뒤"에 취소한다. 순서를 반대로 하면(정리
   * 먼저) 이 함수가 자기 자신을 부른 타이머 핸들러의 현재 claim을 새 예약보다
   * 먼저 지우게 되고, 그 상태에서 새 예약이 실패하면 아무 타이머도 남지 않는다.
   * 예약(ZADD) 자체가 실패하면 호출자에게 그대로 던진다 — 상태 저장만 성공하고
   * 타이머는 유실되는 상황을 막기 위함이다(RoomTimerService.schedule 참고).
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
    const otherKind = kind === 'speed-reveal' ? 'speed-next' : 'speed-reveal';
    this.roomTimerService.cancel(otherKind, roomId).catch((err) => {
      this.logger.warn(
        `스피드모드 타이머 취소 실패(${otherKind}, ${roomId}): ${(err as Error).message}`,
      );
    });
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
      this.emit('room-updated', this.toPublicRoom(room));
    });
  }

  private async buildSongOrder(
    quizId: string,
    isRandom: boolean,
    songLimit: number,
  ): Promise<string[]> {
    const quizSongs = await this.quizSongRepository.find({
      where: { quizId },
      order: { quizSeq: 'ASC' },
    });
    const ids = quizSongs.map((quizSong) => quizSong.quizSongId);
    const ordered = isRandom ? this.shuffle(ids) : ids;
    return ordered.slice(0, songLimit);
  }

  private shuffle<T>(items: T[]): T[] {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  private async prepareRoundData(
    roomId: string,
    quizSongId: string,
    roundIndex: number,
    totalRounds: number,
  ): Promise<RoundPublicStateDto> {
    const quizSong = await this.quizSongRepository.findOne({
      where: { quizSongId },
      relations: { song: { artist: true, album: true } },
    });
    if (!quizSong) {
      throw new NotFoundException(
        `출제곡을 찾을 수 없습니다. (quizSongId: ${quizSongId})`,
      );
    }

    const quizAnswers = await this.quizAnswerRepository.find({
      where: { quizSongId },
    });

    await this.setCurrentAnswers(
      roomId,
      quizAnswers.map((answer) => answer.answerTxt),
    );
    await this.setCurrentReveal(roomId, {
      quizSongId: quizSong.quizSongId,
      songNm: quizSong.song.songNm,
      atstNm: quizSong.song.artist.atstNm,
      albmNm: quizSong.song.album.albmNm,
    });

    return {
      roundIndex,
      totalRounds,
      youtubeVideoId: quizSong.youtubeVideoId,
      startSec: quizSong.startSec,
      endSec: quizSong.endSec,
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

  private async saveRoom(room: RoomItemDto): Promise<void> {
    await this.cacheService.set(
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
      this.deleteCurrentAnswers(roomId),
      this.deleteCurrentReveal(roomId),
      this.cacheService.del(this.chatHistoryKey(roomId)),
    ]);
    this.chatHistory.delete(roomId);
  }

  private roomKey(roomId: string): string {
    return `${ROOM_CACHE_KEY_PREFIX}${roomId}`;
  }

  private async getSongOrder(roomId: string): Promise<string[]> {
    return (
      (await this.cacheService.get<string[]>(this.songOrderKey(roomId))) ?? []
    );
  }

  private async setSongOrder(
    roomId: string,
    songOrder: string[],
  ): Promise<void> {
    await this.cacheService.set(
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

  private async getCurrentAnswers(roomId: string): Promise<string[]> {
    return (
      (await this.cacheService.get<string[]>(this.currentAnswersKey(roomId))) ??
      []
    );
  }

  private async setCurrentAnswers(
    roomId: string,
    answers: string[],
  ): Promise<void> {
    await this.cacheService.set(
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
  ): Promise<RoundRevealInfo | undefined> {
    return this.cacheService.get<RoundRevealInfo>(
      this.currentRevealKey(roomId),
    );
  }

  private async setCurrentReveal(
    roomId: string,
    reveal: RoundRevealInfo,
  ): Promise<void> {
    await this.cacheService.set(
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
   * - API 프로세스가 재시작되면(배포 등) 방 데이터는 Redis에 그대로 남아있는데
   *   토큰만 전부 사라져, 재시작 이전에 입장한 참가자는 소켓에 다시 들어올 수
   *   없게 된다.
   * - 여러 API 인스턴스로 확장하면 발급한 인스턴스와 검증하는 인스턴스가 달라
   *   실패할 수 있다.
   * - 같은 계정이 다른 기기로 재입장하면 토큰을 다시 발급(덮어쓰기)하므로
   *   기존 기기의 토큰이 무효화된다.
   * 결정적 서명 방식은 이 세 가지를 모두 해결한다: 같은 입력이면 프로세스가
   * 다시 시작되거나 인스턴스가 달라도 항상 같은 토큰이 나오고, 재입장해도
   * 다른 기기의 토큰을 무효화하지 않는다. "이 요청자가 그 방의 실제 참가자인가"
   * 자체는 room.participants에 해당 userId가 남아있는지로 검증되므로(퇴장하면
   * 제거됨), 토큰을 별도로 저장/폐기할 필요가 없다.
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
