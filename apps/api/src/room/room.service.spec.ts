import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { CacheService } from '../cache/cache.service';
import { QuizAnswer } from '../quiz/entities/quiz-answer.entity';
import { QuizArtist } from '../quiz/entities/quiz-artist.entity';
import { QuizSong } from '../quiz/entities/quiz-song.entity';
import { Quiz } from '../quiz/entities/quiz.entity';
import { RoomService } from './room.service';

const QUIZ_SONGS = [
  {
    quizSongId: '101',
    quizId: '1',
    quizSeq: 1,
    youtubeVideoId: 'video1',
    startSec: 10,
    endSec: 40,
    song: {
      songNm: '노래1',
      artist: { atstNm: '아이유' },
      album: { albmNm: '앨범1' },
    },
  },
  {
    quizSongId: '102',
    quizId: '1',
    quizSeq: 2,
    youtubeVideoId: 'video2',
    startSec: 0,
    endSec: 30,
    song: {
      songNm: '노래2',
      artist: { atstNm: '아이유' },
      album: { albmNm: '앨범2' },
    },
  },
];

const QUIZ_ANSWERS: Record<string, string[]> = {
  '101': ['노래1', '노래 1'],
  '102': ['노래2'],
};

describe('RoomService', () => {
  let roomService: RoomService;
  let cacheService: CacheService;

  const quizRepositoryMock = {
    findOne: jest.fn(),
  };
  const quizArtistRepositoryMock = {
    find: jest.fn(),
  };
  const quizSongRepositoryMock = {
    find: jest.fn(),
    findOne: jest.fn(),
  };
  const quizAnswerRepositoryMock = {
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
    quizSongRepositoryMock.find.mockResolvedValue(QUIZ_SONGS);
    quizSongRepositoryMock.findOne.mockImplementation(
      ({ where }: { where: { quizSongId: string } }) =>
        Promise.resolve(
          QUIZ_SONGS.find((qs) => qs.quizSongId === where.quizSongId) ?? null,
        ),
    );
    quizAnswerRepositoryMock.find.mockImplementation(
      ({ where }: { where: { quizSongId: string } }) =>
        Promise.resolve(
          (QUIZ_ANSWERS[where.quizSongId] ?? []).map((answerTxt) => ({
            answerTxt,
          })),
        ),
    );

    const app: TestingModule = await Test.createTestingModule({
      providers: [
        RoomService,
        CacheService,
        { provide: getRepositoryToken(Quiz), useValue: quizRepositoryMock },
        {
          provide: getRepositoryToken(QuizArtist),
          useValue: quizArtistRepositoryMock,
        },
        {
          provide: getRepositoryToken(QuizSong),
          useValue: quizSongRepositoryMock,
        },
        {
          provide: getRepositoryToken(QuizAnswer),
          useValue: quizAnswerRepositoryMock,
        },
      ],
    }).compile();

    roomService = app.get<RoomService>(RoomService);
    cacheService = app.get<CacheService>(CacheService);
  });

  afterEach(async () => {
    await cacheService.onModuleDestroy();
  });

  async function createTestRoom(maxUserCnt = 4) {
    return roomService.createRoom({
      roomTtl: '아이유 방',
      quizId: '1',
      isRandom: false,
      maxUserCnt,
      nickname: '방장',
    });
  }

  describe('방 생성/입장/퇴장', () => {
    it('방을 생성하면 방장이 참가자로 포함되고 아티스트 정보가 채워진다', async () => {
      const result = await createTestRoom();

      expect(result.room.quizTtl).toBe('아이유');
      expect(result.room.atstIds).toEqual(['10']);
      expect(result.room.atstNms).toEqual(['아이유']);
      expect(result.room.curUserCnt).toBe(1);
      expect(result.room.hostUserId).toBe(result.userId);
      expect(result.room.gameStatus).toBe('WAITING');
      expect(result.room.currentRound).toBeNull();
      expect(result.room.participants).toEqual([
        { userId: result.userId, nickname: '방장', score: 0 },
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
      const { room } = await createTestRoom();

      const rooms = await roomService.getRooms();

      expect(rooms.map((r) => r.roomId)).toContain(room.roomId);
    });

    it('입장하면 참가자가 추가되고 현재 인원이 증가한다', async () => {
      const { room } = await createTestRoom();

      const joinResult = await roomService.joinRoom(room.roomId, {
        nickname: '참가자1',
      });

      expect(joinResult.room.curUserCnt).toBe(2);
      expect(joinResult.room.participants).toEqual([
        { userId: room.hostUserId, nickname: '방장', score: 0 },
        { userId: joinResult.userId, nickname: '참가자1', score: 0 },
      ]);
    });

    it('정원이 가득 찬 방에 입장하면 ConflictException', async () => {
      const { room } = await createTestRoom(1);

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
      const { room, userId: hostUserId } = await createTestRoom();
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
      const { room } = await createTestRoom();

      await expect(
        roomService.leaveRoom(room.roomId, '존재하지-않는-유저'),
      ).rejects.toThrow(NotFoundException);
    });

    it('동시에 여러 명이 입장해도 정원을 초과하지 않는다', async () => {
      const { room } = await createTestRoom(3);

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

  describe('게임 진행', () => {
    it('방장만 게임을 시작할 수 있다', async () => {
      const { room } = await createTestRoom();
      const { userId: guestUserId } = await roomService.joinRoom(room.roomId, {
        nickname: '참가자1',
      });

      await expect(
        roomService.startGame(room.roomId, guestUserId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('게임을 시작하면 첫 라운드가 준비되고 정답 정보는 노출하지 않는다', async () => {
      const { room, userId: hostUserId } = await createTestRoom();

      const started = await roomService.startGame(room.roomId, hostUserId);

      expect(started.gameStatus).toBe('LOADING');
      expect(started.currentRound?.roundIndex).toBe(0);
      expect(started.currentRound?.totalRounds).toBe(2);
      expect(started.currentRound?.youtubeVideoId).toBe('video1');
      expect(started.currentRound?.revealed).toBe(false);
      expect(started.currentRound?.songNm).toBeNull();
    });

    it('모든 참가자가 로딩 완료를 알리면 별도 조작 없이 자동으로 재생이 시작된다', async () => {
      const { room, userId: hostUserId } = await createTestRoom();
      const { userId: guestUserId } = await roomService.joinRoom(room.roomId, {
        nickname: '참가자1',
      });
      await roomService.startGame(room.roomId, hostUserId);

      const afterHostReady = await roomService.markReady(
        room.roomId,
        hostUserId,
      );
      expect(afterHostReady.gameStatus).toBe('LOADING');

      const afterGuestReady = await roomService.markReady(
        room.roomId,
        guestUserId,
      );
      expect(afterGuestReady.gameStatus).toBe('PLAYING');
      expect(afterGuestReady.currentRound?.playScheduledAt).not.toBeNull();
      expect(
        new Date(
          afterGuestReady.currentRound!.playScheduledAt!,
        ).getTime(),
      ).toBeGreaterThan(Date.now());
    });

    it('정답과 무관한 채팅은 그대로 broadcast된다', async () => {
      const { room, userId: hostUserId } = await createTestRoom(1);
      await roomService.startGame(room.roomId, hostUserId);
      await roomService.markReady(room.roomId, hostUserId);

      const result = await roomService.submitChatMessage(
        room.roomId,
        hostUserId,
        '안녕하세요',
      );

      expect(result.action).toBe('broadcast');
    });

    it('정답 텍스트가 포함된 메시지는 채팅에 올라가지 않는다', async () => {
      const { room, userId: hostUserId } = await createTestRoom(1);
      await roomService.startGame(room.roomId, hostUserId);
      await roomService.markReady(room.roomId, hostUserId);

      const result = await roomService.submitChatMessage(
        room.roomId,
        hostUserId,
        '정답은 노래1 같은데',
      );

      expect(result.action).toBe('blocked');
    });

    it('정답과 정확히 일치하면 점수를 받고 정답 처리된다', async () => {
      const { room, userId: hostUserId } = await createTestRoom(2);
      const { userId: guestUserId } = await roomService.joinRoom(room.roomId, {
        nickname: '참가자1',
      });
      await roomService.startGame(room.roomId, hostUserId);
      await roomService.markReady(room.roomId, hostUserId);
      await roomService.markReady(room.roomId, guestUserId);

      const firstResult = await roomService.submitChatMessage(
        room.roomId,
        hostUserId,
        '노래1',
      );
      expect(firstResult.action).toBe('correct');
      expect(firstResult.correctInfo).toEqual({
        userId: hostUserId,
        nickname: '방장',
        points: 6,
        rank: 1,
      });

      const secondResult = await roomService.submitChatMessage(
        room.roomId,
        guestUserId,
        '노래 1',
      );
      expect(secondResult.action).toBe('correct');
      expect(secondResult.correctInfo?.points).toBe(4);
      expect(secondResult.correctInfo?.rank).toBe(2);

      const roomAfter = await roomService.getRoom(room.roomId);
      expect(
        roomAfter?.participants.find((p) => p.userId === hostUserId)?.score,
      ).toBe(6);
      expect(
        roomAfter?.participants.find((p) => p.userId === guestUserId)?.score,
      ).toBe(4);

      // 전원이 맞췄으므로 라운드가 자동 종료되고 정답이 공개된다.
      expect(roomAfter?.gameStatus).toBe('ROUND_ENDED');
      expect(roomAfter?.currentRound?.revealed).toBe(true);
      expect(roomAfter?.currentRound?.songNm).toBe('노래1');
    });

    it('이미 정답을 맞춘 사람이 같은 정답을 다시 보내면 blocked 처리된다', async () => {
      const { room, userId: hostUserId } = await createTestRoom(2);
      const { userId: guestUserId } = await roomService.joinRoom(room.roomId, {
        nickname: '참가자1',
      });
      await roomService.startGame(room.roomId, hostUserId);
      await roomService.markReady(room.roomId, hostUserId);
      await roomService.markReady(room.roomId, guestUserId);

      await roomService.submitChatMessage(room.roomId, hostUserId, '노래1');
      const repeated = await roomService.submitChatMessage(
        room.roomId,
        hostUserId,
        '노래1',
      );

      expect(repeated.action).toBe('blocked');
    });

    it('과반 미만이 스킵을 요청하면 라운드가 끝나지 않는다', async () => {
      const { room, userId: hostUserId } = await createTestRoom(3);
      const { userId: guest1 } = await roomService.joinRoom(room.roomId, {
        nickname: '참가자1',
      });
      await roomService.joinRoom(room.roomId, { nickname: '참가자2' });
      await roomService.startGame(room.roomId, hostUserId);
      await roomService.markReady(room.roomId, hostUserId);
      await roomService.markReady(room.roomId, guest1);
      const finalReady = await roomService.markReady(
        room.roomId,
        (await roomService.getRoom(room.roomId))!.participants[2].userId,
      );
      expect(finalReady.gameStatus).toBe('PLAYING');

      // 3명 중 1명만 스킵 요청 -> 과반(2명) 미달이므로 라운드 유지
      const afterOneSkip = await roomService.requestSkip(
        room.roomId,
        hostUserId,
      );

      expect(afterOneSkip.gameStatus).toBe('PLAYING');
      expect(afterOneSkip.currentRound?.skipUserIds).toEqual([hostUserId]);
    });

    it('과반이 스킵을 요청하면 라운드가 즉시 종료(정답 공개)된다', async () => {
      const { room, userId: hostUserId } = await createTestRoom(3);
      const { userId: guest1 } = await roomService.joinRoom(room.roomId, {
        nickname: '참가자1',
      });
      const { userId: guest2 } = await roomService.joinRoom(room.roomId, {
        nickname: '참가자2',
      });
      await roomService.startGame(room.roomId, hostUserId);
      await roomService.markReady(room.roomId, hostUserId);
      await roomService.markReady(room.roomId, guest1);
      await roomService.markReady(room.roomId, guest2);

      await roomService.requestSkip(room.roomId, hostUserId);
      const afterMajoritySkip = await roomService.requestSkip(
        room.roomId,
        guest1,
      );

      expect(afterMajoritySkip.gameStatus).toBe('ROUND_ENDED');
      expect(afterMajoritySkip.currentRound?.revealed).toBe(true);
      expect(afterMajoritySkip.currentRound?.songNm).toBe('노래1');
    });

    it('같은 유저가 스킵을 여러 번 요청해도 한 표로만 계산된다', async () => {
      const { room, userId: hostUserId } = await createTestRoom(3);
      const { userId: guest1 } = await roomService.joinRoom(room.roomId, {
        nickname: '참가자1',
      });
      await roomService.joinRoom(room.roomId, { nickname: '참가자2' });
      await roomService.startGame(room.roomId, hostUserId);
      await roomService.markReady(room.roomId, hostUserId);
      await roomService.markReady(room.roomId, guest1);
      await roomService.markReady(
        room.roomId,
        (await roomService.getRoom(room.roomId))!.participants[2].userId,
      );

      await roomService.requestSkip(room.roomId, hostUserId);
      const afterRepeatedSkip = await roomService.requestSkip(
        room.roomId,
        hostUserId,
      );

      expect(afterRepeatedSkip.gameStatus).toBe('PLAYING');
      expect(afterRepeatedSkip.currentRound?.skipUserIds).toEqual([
        hostUserId,
      ]);
    });

    it('제한 시간이 지나면 라운드가 자동 종료된다', async () => {
      jest.useFakeTimers();
      try {
        const { room, userId: hostUserId } = await createTestRoom(1);
        await roomService.startGame(room.roomId, hostUserId);
        await roomService.markReady(room.roomId, hostUserId);

        // 라운드 제한시간(30초) + 재생 예약 유예시간(1초)
        await jest.advanceTimersByTimeAsync(31_000);

        const roomAfter = await roomService.getRoom(room.roomId);
        expect(roomAfter?.gameStatus).toBe('ROUND_ENDED');
        expect(roomAfter?.currentRound?.revealed).toBe(true);
      } finally {
        jest.useRealTimers();
      }
    });

    it('방장만 강제 스킵을 요청할 수 있다', async () => {
      const { room, userId: hostUserId } = await createTestRoom(2);
      const { userId: guestUserId } = await roomService.joinRoom(room.roomId, {
        nickname: '참가자1',
      });
      await roomService.startGame(room.roomId, hostUserId);
      await roomService.markReady(room.roomId, hostUserId);
      await roomService.markReady(room.roomId, guestUserId);

      await expect(
        roomService.forceSkip(room.roomId, guestUserId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('재생 중이 아니면 강제 스킵을 요청할 수 없다', async () => {
      const { room, userId: hostUserId } = await createTestRoom(1);
      await roomService.startGame(room.roomId, hostUserId);

      await expect(
        roomService.forceSkip(room.roomId, hostUserId),
      ).rejects.toThrow(ConflictException);
    });

    it('방장이 강제 스킵을 요청하면 유예 시간 후 라운드가 종료(정답 공개)된다', async () => {
      jest.useFakeTimers();
      try {
        const { room, userId: hostUserId } = await createTestRoom(1);
        await roomService.startGame(room.roomId, hostUserId);
        await roomService.markReady(room.roomId, hostUserId);

        const afterForceSkip = await roomService.forceSkip(
          room.roomId,
          hostUserId,
        );
        expect(afterForceSkip.gameStatus).toBe('PLAYING');
        expect(afterForceSkip.currentRound?.forceSkipAt).not.toBeNull();

        await jest.advanceTimersByTimeAsync(3_000);

        const roomAfter = await roomService.getRoom(room.roomId);
        expect(roomAfter?.gameStatus).toBe('ROUND_ENDED');
        expect(roomAfter?.currentRound?.revealed).toBe(true);
        expect(roomAfter?.currentRound?.songNm).toBe('노래1');
      } finally {
        jest.useRealTimers();
      }
    });

    it('방장만 다음 라운드로 넘어갈 수 있고, 라운드가 끝나야 넘어갈 수 있다', async () => {
      const { room, userId: hostUserId } = await createTestRoom(1);
      await roomService.startGame(room.roomId, hostUserId);

      await expect(
        roomService.nextRound(room.roomId, hostUserId),
      ).rejects.toThrow(ConflictException);

      await roomService.markReady(room.roomId, hostUserId);
      await roomService.submitChatMessage(room.roomId, hostUserId, '노래1');

      await expect(roomService.nextRound(room.roomId, '남')).rejects.toThrow(
        ForbiddenException,
      );

      const next = await roomService.nextRound(room.roomId, hostUserId);
      expect(next.gameStatus).toBe('LOADING');
      expect(next.currentRound?.roundIndex).toBe(1);
      expect(next.currentRound?.youtubeVideoId).toBe('video2');
    });

    it('마지막 라운드까지 끝나면 게임이 FINISHED로 종료된다', async () => {
      const { room, userId: hostUserId } = await createTestRoom(1);
      await roomService.startGame(room.roomId, hostUserId);
      await roomService.markReady(room.roomId, hostUserId);
      await roomService.submitChatMessage(room.roomId, hostUserId, '노래1');
      await roomService.nextRound(room.roomId, hostUserId);

      await roomService.markReady(room.roomId, hostUserId);
      await roomService.submitChatMessage(room.roomId, hostUserId, '노래2');
      const finished = await roomService.nextRound(room.roomId, hostUserId);

      expect(finished.gameStatus).toBe('FINISHED');
      expect(finished.currentRound).toBeNull();
    });
  });
});
