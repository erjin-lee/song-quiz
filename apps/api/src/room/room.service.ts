import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
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
import { normalizeAnswer, pointsForRank } from './game-scoring.util';

const ROOM_INDEX_CACHE_KEY = 'room:index';
const ROOM_CACHE_KEY_PREFIX = 'room:';
/** 방은 활동(생성/입장/퇴장/게임 진행)이 있을 때마다 TTL이 갱신되는 슬라이딩 방식이다. */
const ROOM_TTL_SECONDS = 6 * 60 * 60;
/** 한 라운드의 제한 시간. 이 시간이 지나면 전원이 못 맞춰도 라운드가 강제 종료된다. */
const ROUND_TIME_LIMIT_SECONDS = 30;

export interface ChatSubmissionResult {
  action: 'broadcast' | 'blocked' | 'correct';
  correctInfo?: {
    userId: string;
    nickname: string;
    points: number;
    rank: number;
  };
}

interface RoundRevealInfo {
  songNm: string;
  atstNm: string;
  albmNm: string;
}

/**
 * 방/게임 상태가 바뀔 때마다 'room-updated' 이벤트로 최신 RoomItemDto를 전파한다.
 * RoomGateway가 구독해 소켓으로 브로드캐스트한다(REST 변경도 즉시 소켓에 반영됨).
 */
@Injectable()
export class RoomService extends EventEmitter {
  private readonly logger = new Logger(RoomService.name);

  /**
   * roomId별 작업을 직렬화하는 간단한 in-memory 락.
   * 프로세스 내 동시 요청(같은 방에 대한 동시 입장/퇴장/정답 제출)으로 인한 경쟁 상태를 막아준다.
   * 다중 인스턴스로 수평 확장하는 경우에는 이 락과 아래 in-memory 상태들이 인스턴스 간에 공유되지
   * 않으므로 Redis 기반 분산 락/상태 공유로 교체가 필요하다.
   */
  private readonly roomLocks = new Map<string, Promise<unknown>>();

  /** roomId -> 이번 게임에서 출제할 quizSongId 순서(랜덤이면 셔플됨). 스포일러라 클라이언트에 노출하지 않는다. */
  private readonly songOrders = new Map<string, string[]>();
  /** roomId -> 현재 라운드의 허용 정답 목록. 정답 채점에만 쓰고 절대 클라이언트로 보내지 않는다. */
  private readonly currentAnswers = new Map<string, string[]>();
  /** roomId -> 현재 라운드 종료 시 공개할 곡 정보. 라운드 종료 전까지는 room 객체에 채우지 않는다. */
  private readonly currentReveal = new Map<string, RoundRevealInfo>();
  /** roomId -> 라운드 제한시간 타이머 */
  private readonly roundTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly cacheService: CacheService,
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
  }

  async getRooms(): Promise<RoomItemDto[]> {
    const roomIds = await this.getRoomIndex();
    const rooms = await Promise.all(
      roomIds.map((roomId) =>
        this.cacheService.get<RoomItemDto>(this.roomKey(roomId)),
      ),
    );

    return rooms.filter((room): room is RoomItemDto => room !== undefined);
  }

  async getRoom(roomId: string): Promise<RoomItemDto | undefined> {
    return this.cacheService.get<RoomItemDto>(this.roomKey(roomId));
  }

  async createRoom(dto: CreateRoomRequestDto): Promise<RoomJoinResultDto> {
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

    const hostUserId = randomUUID();
    const room: RoomItemDto = {
      roomId: randomUUID(),
      roomTtl: dto.roomTtl,
      quizId: dto.quizId,
      quizTtl: quiz.quizTtl,
      atstIds: quizArtists.map((quizArtist) => quizArtist.atstId),
      atstNms: quizArtists.map((quizArtist) => quizArtist.artist.atstNm),
      isRandom: dto.isRandom,
      maxUserCnt: dto.maxUserCnt,
      curUserCnt: 1,
      hostUserId,
      participants: [{ userId: hostUserId, nickname: dto.nickname, score: 0 }],
      crtDt: new Date().toISOString(),
      gameStatus: 'WAITING',
      currentRound: null,
    };

    await this.saveRoom(room);
    await this.addToIndex(room.roomId);

    return { room, userId: hostUserId };
  }

  async joinRoom(
    roomId: string,
    dto: JoinRoomRequestDto,
  ): Promise<RoomJoinResultDto> {
    return this.withRoomLock(roomId, async () => {
      const room = await this.getRoomOrThrow(roomId);

      if (room.curUserCnt >= room.maxUserCnt) {
        throw new ConflictException('방 정원이 가득 찼습니다.');
      }

      const userId = randomUUID();
      room.participants.push({ userId, nickname: dto.nickname, score: 0 });
      room.curUserCnt = room.participants.length;

      if (room.gameStatus === 'READY_TO_PLAY') {
        // 새 참가자는 아직 영상 로딩을 완료하지 않았으므로 다시 로딩 대기로 되돌린다.
        room.gameStatus = 'LOADING';
      }

      await this.saveRoom(room);
      this.emit('room-updated', room);

      return { room, userId };
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
        this.recomputeReadyStatus(room);
      } else if (room.gameStatus === 'PLAYING' && room.currentRound) {
        const allAnswered = room.participants.every((participant) =>
          room.currentRound!.correctUserIds.includes(participant.userId),
        );
        if (allAnswered || this.hasSkipMajority(room)) {
          this.finalizeRoundEnd(room);
        }
      }

      await this.saveRoom(room);
      this.emit('room-updated', room);

      return { roomDeleted: false, room };
    });
  }

  /** 방장이 게임을 시작한다. 첫 라운드를 준비하고 참가자들의 영상 로딩 완료를 기다린다. */
  async startGame(roomId: string, requesterUserId: string): Promise<RoomItemDto> {
    return this.withRoomLock(roomId, async () => {
      const room = await this.getRoomOrThrow(roomId);
      this.assertHost(room, requesterUserId);

      if (room.gameStatus !== 'WAITING') {
        throw new ConflictException('이미 시작되었거나 진행 중인 게임입니다.');
      }

      const songOrder = await this.buildSongOrder(room.quizId, room.isRandom);
      if (songOrder.length === 0) {
        throw new NotFoundException('퀴즈에 출제곡이 없습니다.');
      }

      this.songOrders.set(roomId, songOrder);
      room.gameStatus = 'LOADING';
      room.currentRound = await this.prepareRoundData(
        roomId,
        songOrder[0],
        0,
        songOrder.length,
      );

      await this.saveRoom(room);
      this.emit('room-updated', room);
      return room;
    });
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
      this.recomputeReadyStatus(room);

      await this.saveRoom(room);
      this.emit('room-updated', room);
      return room;
    });
  }

  /** 방장이 (전원 로딩 완료 후) 실제 재생을 시작한다. */
  async startRound(roomId: string, requesterUserId: string): Promise<RoomItemDto> {
    return this.withRoomLock(roomId, async () => {
      const room = await this.getRoomOrThrow(roomId);
      this.assertHost(room, requesterUserId);

      if (room.gameStatus !== 'READY_TO_PLAY' || !room.currentRound) {
        throw new ConflictException(
          '아직 모든 참가자의 영상 로딩이 끝나지 않았습니다.',
        );
      }

      room.gameStatus = 'PLAYING';
      room.currentRound.playStartedAt = new Date().toISOString();

      await this.saveRoom(room);
      this.scheduleRoundTimer(roomId);
      this.emit('room-updated', room);
      return room;
    });
  }

  /** 방장이 라운드 종료 후 다음 라운드로 넘어간다(또는 마지막 라운드면 게임을 종료한다). */
  async nextRound(roomId: string, requesterUserId: string): Promise<RoomItemDto> {
    return this.withRoomLock(roomId, async () => {
      const room = await this.getRoomOrThrow(roomId);
      this.assertHost(room, requesterUserId);

      if (room.gameStatus !== 'ROUND_ENDED') {
        throw new ConflictException('아직 라운드가 끝나지 않았습니다.');
      }

      const songOrder = this.songOrders.get(roomId) ?? [];
      const nextIndex = (room.currentRound?.roundIndex ?? -1) + 1;

      if (nextIndex >= songOrder.length) {
        room.gameStatus = 'FINISHED';
        room.currentRound = null;
        this.songOrders.delete(roomId);
        this.currentAnswers.delete(roomId);
        this.currentReveal.delete(roomId);
      } else {
        room.gameStatus = 'LOADING';
        room.currentRound = await this.prepareRoundData(
          roomId,
          songOrder[nextIndex],
          nextIndex,
          songOrder.length,
        );
      }

      await this.saveRoom(room);
      this.emit('room-updated', room);
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

      if (!round || round.revealed) {
        return { action: 'broadcast' };
      }

      const answers = (this.currentAnswers.get(roomId) ?? []).filter(
        (answer) => normalizeAnswer(answer).length > 0,
      );
      if (answers.length === 0) {
        return { action: 'broadcast' };
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
        return { action: 'broadcast' };
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
        this.finalizeRoundEnd(room);
      }

      await this.saveRoom(room);
      this.emit('room-updated', room);

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
        this.finalizeRoundEnd(room);
      }

      await this.saveRoom(room);
      this.emit('room-updated', room);
      return room;
    });
  }

  private assertHost(room: RoomItemDto, requesterUserId: string): void {
    if (room.hostUserId !== requesterUserId) {
      throw new ForbiddenException('방장만 할 수 있는 작업입니다.');
    }
  }

  private recomputeReadyStatus(room: RoomItemDto): void {
    const round = room.currentRound;
    if (!round || room.gameStatus !== 'LOADING') {
      return;
    }
    const allReady = room.participants.every((participant) =>
      round.readyUserIds.includes(participant.userId),
    );
    if (allReady) {
      room.gameStatus = 'READY_TO_PLAY';
    }
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

  private finalizeRoundEnd(room: RoomItemDto): void {
    this.clearRoundTimer(room.roomId);
    if (!room.currentRound) {
      return;
    }
    const reveal = this.currentReveal.get(room.roomId);
    room.currentRound.revealed = true;
    room.currentRound.songNm = reveal?.songNm ?? null;
    room.currentRound.atstNm = reveal?.atstNm ?? null;
    room.currentRound.albmNm = reveal?.albmNm ?? null;
    room.gameStatus = 'ROUND_ENDED';
  }

  private scheduleRoundTimer(roomId: string): void {
    this.clearRoundTimer(roomId);
    const timer = setTimeout(() => {
      this.handleRoundTimeout(roomId).catch((err) => {
        this.logger.error(
          `라운드 타임아웃 처리 실패(roomId: ${roomId}): ${(err as Error).message}`,
        );
      });
    }, ROUND_TIME_LIMIT_SECONDS * 1000);
    timer.unref();
    this.roundTimers.set(roomId, timer);
  }

  private clearRoundTimer(roomId: string): void {
    const timer = this.roundTimers.get(roomId);
    if (timer) {
      clearTimeout(timer);
      this.roundTimers.delete(roomId);
    }
  }

  private async handleRoundTimeout(roomId: string): Promise<void> {
    await this.withRoomLock(roomId, async () => {
      const room = await this.getRoom(roomId);
      if (!room || room.gameStatus !== 'PLAYING') {
        return;
      }
      this.finalizeRoundEnd(room);
      await this.saveRoom(room);
      this.emit('room-updated', room);
    });
  }

  private async buildSongOrder(
    quizId: string,
    isRandom: boolean,
  ): Promise<string[]> {
    const quizSongs = await this.quizSongRepository.find({
      where: { quizId },
      order: { quizSeq: 'ASC' },
    });
    const ids = quizSongs.map((quizSong) => quizSong.quizSongId);
    return isRandom ? this.shuffle(ids) : ids;
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

    this.currentAnswers.set(
      roomId,
      quizAnswers.map((answer) => answer.answerTxt),
    );
    this.currentReveal.set(roomId, {
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
      playStartedAt: null,
      revealed: false,
      songNm: null,
      atstNm: null,
      albmNm: null,
    };
  }

  private async getRoomOrThrow(roomId: string): Promise<RoomItemDto> {
    const room = await this.getRoom(roomId);
    if (!room) {
      throw new NotFoundException(`방을 찾을 수 없습니다. (roomId: ${roomId})`);
    }
    return room;
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
    this.songOrders.delete(roomId);
    this.currentAnswers.delete(roomId);
    this.currentReveal.delete(roomId);
  }

  private roomKey(roomId: string): string {
    return `${ROOM_CACHE_KEY_PREFIX}${roomId}`;
  }

  private async getRoomIndex(): Promise<string[]> {
    return (
      (await this.cacheService.get<string[]>(ROOM_INDEX_CACHE_KEY)) ?? []
    );
  }

  private async addToIndex(roomId: string): Promise<void> {
    const index = await this.getRoomIndex();
    index.push(roomId);
    await this.cacheService.set(ROOM_INDEX_CACHE_KEY, index, ROOM_TTL_SECONDS);
  }

  private async removeFromIndex(roomId: string): Promise<void> {
    const index = await this.getRoomIndex();
    await this.cacheService.set(
      ROOM_INDEX_CACHE_KEY,
      index.filter((id) => id !== roomId),
      ROOM_TTL_SECONDS,
    );
  }

  /** 같은 roomId에 대한 작업을 도착한 순서대로 하나씩 실행되도록 직렬화한다. */
  private async withRoomLock<T>(
    roomId: string,
    task: () => Promise<T>,
  ): Promise<T> {
    const previous = this.roomLocks.get(roomId) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(() => task());
    this.roomLocks.set(
      roomId,
      run.catch(() => undefined),
    );
    return run;
  }
}
