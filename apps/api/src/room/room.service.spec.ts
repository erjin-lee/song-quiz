import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { CacheService } from '../cache/cache.service';
import { QuizArtist } from '../quiz/entities/quiz-artist.entity';
import { Quiz } from '../quiz/entities/quiz.entity';
import { RoomService } from './room.service';

describe('RoomService', () => {
  let roomService: RoomService;
  let cacheService: CacheService;

  const quizRepositoryMock = {
    findOne: jest.fn(),
  };
  const quizArtistRepositoryMock = {
    find: jest.fn(),
  };

  beforeEach(async () => {
    delete process.env.REDIS_HOST;

    quizRepositoryMock.findOne.mockResolvedValue({
      quizId: '1',
      quizTtl: '아이유',
      useYn: 'Y',
    });
    quizArtistRepositoryMock.find.mockResolvedValue([
      { atstId: '10', artist: { atstNm: '아이유' } },
    ]);

    const app: TestingModule = await Test.createTestingModule({
      providers: [
        RoomService,
        CacheService,
        { provide: getRepositoryToken(Quiz), useValue: quizRepositoryMock },
        {
          provide: getRepositoryToken(QuizArtist),
          useValue: quizArtistRepositoryMock,
        },
      ],
    }).compile();

    roomService = app.get<RoomService>(RoomService);
    cacheService = app.get<CacheService>(CacheService);
  });

  afterEach(async () => {
    await cacheService.onModuleDestroy();
  });

  it('방을 생성하면 방장이 참가자로 포함되고 아티스트 정보가 채워진다', async () => {
    const result = await roomService.createRoom({
      roomTtl: '아이유 방',
      quizId: '1',
      isRandom: false,
      maxUserCnt: 4,
      nickname: '방장',
    });

    expect(result.room.quizTtl).toBe('아이유');
    expect(result.room.atstIds).toEqual(['10']);
    expect(result.room.atstNms).toEqual(['아이유']);
    expect(result.room.curUserCnt).toBe(1);
    expect(result.room.hostUserId).toBe(result.userId);
    expect(result.room.participants).toEqual([
      { userId: result.userId, nickname: '방장' },
    ]);
  });

  it('존재하지 않는 퀴즈로 생성하면 NotFoundException', async () => {
    quizRepositoryMock.findOne.mockResolvedValue(null);

    await expect(
      roomService.createRoom({
        roomTtl: '방',
        quizId: '999',
        isRandom: false,
        maxUserCnt: 4,
        nickname: '방장',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('생성한 방은 목록 조회에 나타난다', async () => {
    const { room } = await roomService.createRoom({
      roomTtl: '아이유 방',
      quizId: '1',
      isRandom: false,
      maxUserCnt: 4,
      nickname: '방장',
    });

    const rooms = await roomService.getRooms();

    expect(rooms.map((r) => r.roomId)).toContain(room.roomId);
  });

  it('입장하면 참가자가 추가되고 현재 인원이 증가한다', async () => {
    const { room } = await roomService.createRoom({
      roomTtl: '아이유 방',
      quizId: '1',
      isRandom: false,
      maxUserCnt: 4,
      nickname: '방장',
    });

    const joinResult = await roomService.joinRoom(room.roomId, {
      nickname: '참가자1',
    });

    expect(joinResult.room.curUserCnt).toBe(2);
    expect(joinResult.room.participants).toEqual([
      { userId: room.hostUserId, nickname: '방장' },
      { userId: joinResult.userId, nickname: '참가자1' },
    ]);
  });

  it('정원이 가득 찬 방에 입장하면 ConflictException', async () => {
    const { room } = await roomService.createRoom({
      roomTtl: '방',
      quizId: '1',
      isRandom: false,
      maxUserCnt: 1,
      nickname: '방장',
    });

    await expect(
      roomService.joinRoom(room.roomId, { nickname: '참가자1' }),
    ).rejects.toThrow(ConflictException);
  });

  it('존재하지 않는 방에 입장하면 NotFoundException', async () => {
    await expect(
      roomService.joinRoom('없는방', { nickname: '참가자1' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('퇴장하면 참가자가 제거되고, 마지막 참가자가 나가면 방이 삭제된다', async () => {
    const { room, userId: hostUserId } = await roomService.createRoom({
      roomTtl: '아이유 방',
      quizId: '1',
      isRandom: false,
      maxUserCnt: 4,
      nickname: '방장',
    });
    const { userId: guestUserId } = await roomService.joinRoom(room.roomId, {
      nickname: '참가자1',
    });

    const afterHostLeaves = await roomService.leaveRoom(
      room.roomId,
      hostUserId,
    );
    expect(afterHostLeaves.roomDeleted).toBe(false);
    expect(afterHostLeaves.room?.hostUserId).toBe(guestUserId);
    expect(afterHostLeaves.room?.curUserCnt).toBe(1);

    const afterGuestLeaves = await roomService.leaveRoom(
      room.roomId,
      guestUserId,
    );
    expect(afterGuestLeaves.roomDeleted).toBe(true);

    const rooms = await roomService.getRooms();
    expect(rooms.map((r) => r.roomId)).not.toContain(room.roomId);
  });

  it('방에 없는 유저가 퇴장을 시도하면 NotFoundException', async () => {
    const { room } = await roomService.createRoom({
      roomTtl: '방',
      quizId: '1',
      isRandom: false,
      maxUserCnt: 4,
      nickname: '방장',
    });

    await expect(
      roomService.leaveRoom(room.roomId, '존재하지-않는-유저'),
    ).rejects.toThrow(NotFoundException);
  });

  it('동시에 여러 명이 입장해도 정원을 초과하지 않는다', async () => {
    const { room } = await roomService.createRoom({
      roomTtl: '방',
      quizId: '1',
      isRandom: false,
      maxUserCnt: 3,
      nickname: '방장',
    });

    const results = await Promise.allSettled([
      roomService.joinRoom(room.roomId, { nickname: 'A' }),
      roomService.joinRoom(room.roomId, { nickname: 'B' }),
      roomService.joinRoom(room.roomId, { nickname: 'C' }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(2);
    expect(rejected).toHaveLength(1);

    const finalRoom = await roomService.getRoom(room.roomId);
    expect(finalRoom?.curUserCnt).toBe(3);
  });
});
