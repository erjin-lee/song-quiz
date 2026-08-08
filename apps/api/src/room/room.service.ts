import { randomUUID } from 'crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CacheService } from '../cache/cache.service';
import { QuizArtist } from '../quiz/entities/quiz-artist.entity';
import { Quiz } from '../quiz/entities/quiz.entity';
import { CreateRoomRequestDto } from './dto/create-room-request.dto';
import { JoinRoomRequestDto } from './dto/join-room-request.dto';
import { LeaveRoomResultDto } from './dto/leave-room-result.dto';
import { RoomItemDto } from './dto/room-item.dto';
import { RoomJoinResultDto } from './dto/room-join-result.dto';

const ROOM_INDEX_CACHE_KEY = 'room:index';
const ROOM_CACHE_KEY_PREFIX = 'room:';
/** 방은 활동(생성/입장/퇴장)이 있을 때마다 TTL이 갱신되는 슬라이딩 방식이다. */
const ROOM_TTL_SECONDS = 6 * 60 * 60;

@Injectable()
export class RoomService {
  /**
   * roomId별 작업을 직렬화하는 간단한 in-memory 락.
   * 프로세스 내 동시 요청(같은 방에 대한 동시 입장/퇴장)으로 인한 경쟁 상태를 막아준다.
   * 다중 인스턴스로 수평 확장하는 경우에는 이 락이 인스턴스 간에 공유되지 않으므로
   * Redis 기반 분산 락(WATCH/MULTI, Redlock 등)으로 교체가 필요하다.
   */
  private readonly roomLocks = new Map<string, Promise<unknown>>();

  constructor(
    private readonly cacheService: CacheService,
    @InjectRepository(Quiz)
    private readonly quizRepository: Repository<Quiz>,
    @InjectRepository(QuizArtist)
    private readonly quizArtistRepository: Repository<QuizArtist>,
  ) {}

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
      participants: [{ userId: hostUserId, nickname: dto.nickname }],
      crtDt: new Date().toISOString(),
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
      room.participants.push({ userId, nickname: dto.nickname });
      room.curUserCnt = room.participants.length;

      await this.saveRoom(room);

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

      await this.saveRoom(room);
      return { roomDeleted: false, room };
    });
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
    await this.cacheService.set(
      ROOM_INDEX_CACHE_KEY,
      index,
      ROOM_TTL_SECONDS,
    );
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
