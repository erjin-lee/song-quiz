import { Test, TestingModule } from '@nestjs/testing';
import { CacheService } from '../cache/cache.service';
import { QuizClient } from './clients/quiz.client';
import { RoomLockService } from './room-lock.service';
import { RoomRoundService } from './room-round.service';
import { RoomRepository } from './room.repository';
import { RoomTimerService } from './room-timer.service';
import { RoomService } from './room.service';

const QUIZ_SONGS = [
  {
    quizSongId: '101',
    quizSeq: 1,
    youtubeVideoId: 'video1',
    startSec: 10,
    endSec: 40,
    songNm: '노래1',
    atstNm: '아이유',
    albmNm: '앨범1',
  },
  {
    quizSongId: '102',
    quizSeq: 2,
    youtubeVideoId: 'video2',
    startSec: 0,
    endSec: 30,
    songNm: '노래2',
    atstNm: '아이유',
    albmNm: '앨범2',
  },
];

const QUIZ_ANSWERS: Record<string, string[]> = {
  '101': ['노래1', '노래 1'],
  '102': ['노래2'],
};

describe('RoomService', () => {
  let roomService: RoomService;
  let cacheService: CacheService;
  let roomLockService: RoomLockService;
  let roomTimerService: RoomTimerService;
  let roomRepository: RoomRepository;
  let roomRoundService: RoomRoundService;

  const quizClientMock = {
    getSummary: jest.fn(),
    incrementPlayCount: jest.fn(),
    getQuizRounds: jest.fn(),
  };

  beforeEach(async () => {
    delete process.env.REDIS_HOST;

    quizClientMock.getSummary.mockResolvedValue({
      quizId: '1',
      quizTtl: '아이유',
      quizDesc: '아이유 노래 맞추기',
      thumbImgUrl: null,
      songCount: QUIZ_SONGS.length,
      atstIds: ['10'],
      atstNms: ['아이유'],
    });
    quizClientMock.incrementPlayCount.mockResolvedValue(undefined);
    quizClientMock.getQuizRounds.mockResolvedValue(
      QUIZ_SONGS.map((quizSong) => ({
        quizSongId: quizSong.quizSongId,
        youtubeVideoId: quizSong.youtubeVideoId,
        startSec: quizSong.startSec,
        endSec: quizSong.endSec,
        songNm: quizSong.songNm,
        atstNm: quizSong.atstNm,
        albmNm: quizSong.albmNm,
        answers: QUIZ_ANSWERS[quizSong.quizSongId] ?? [],
      })),
    );

    const app: TestingModule = await Test.createTestingModule({
      providers: [
        RoomService,
        RoomRepository,
        RoomRoundService,
        CacheService,
        RoomLockService,
        RoomTimerService,
        { provide: QuizClient, useValue: quizClientMock },
      ],
    }).compile();

    roomService = app.get<RoomService>(RoomService);
    cacheService = app.get<CacheService>(CacheService);
    roomLockService = app.get<RoomLockService>(RoomLockService);
    roomTimerService = app.get<RoomTimerService>(RoomTimerService);
    roomRepository = app.get<RoomRepository>(RoomRepository);
    roomRoundService = app.get<RoomRoundService>(RoomRoundService);
  });

  afterEach(async () => {
    await cacheService.onApplicationShutdown();
    roomTimerService.onModuleDestroy();
  });

  async function createTestRoom(
    maxUserCnt = 4,
    speedModeEnabled = false,
    songLimit?: number,
  ) {
    return roomService.createRoom({
      roomTtl: '아이유 방',
      quizId: '1',
      isRandom: false,
      speedModeEnabled,
      maxUserCnt,
      nickname: '방장',
      songLimit,
    });
  }

  describe('참가자 접근 토큰(accessToken)', () => {
    it('방을 생성하면 accessToken이 함께 발급되고 verifyMembershipToken으로 검증된다', async () => {
      const { room, userId, accessToken } = await createTestRoom();

      expect(accessToken).toEqual(expect.any(String));
      expect(
        roomService.verifyMembershipToken(room.roomId, userId, accessToken),
      ).toBe(true);
      expect(
        roomService.verifyMembershipToken(room.roomId, userId, '가짜토큰'),
      ).toBe(false);
    });

    it('입장하면 accessToken이 함께 발급된다', async () => {
      const { room } = await createTestRoom();

      const joinResult = await roomService.joinRoom(room.roomId, {
        nickname: '참가자1',
      });

      expect(joinResult.accessToken).toEqual(expect.any(String));
      expect(
        roomService.verifyMembershipToken(
          room.roomId,
          joinResult.userId,
          joinResult.accessToken,
        ),
      ).toBe(true);
    });

    it('다른 참가자의 userId로는 내 accessToken이 검증되지 않는다', async () => {
      const { room, accessToken: hostAccessToken } = await createTestRoom();
      const { userId: guestUserId } = await roomService.joinRoom(room.roomId, {
        nickname: '참가자1',
      });

      expect(
        roomService.verifyMembershipToken(
          room.roomId,
          guestUserId,
          hostAccessToken,
        ),
      ).toBe(false);
    });

    it('같은 roomId+userId면 항상 같은 토큰이 계산된다(상태 저장 없이 결정적)', async () => {
      const { room, userId, accessToken } = await createTestRoom();

      // API 프로세스가 재시작돼도(배포 등) 같은 값이 나와야 하므로, 별도
      // RoomService 인스턴스에서 계산해도 동일해야 한다.
      const anotherInstance = new RoomService(
        roomRepository,
        roomRoundService,
        roomLockService,
        roomTimerService,
        quizClientMock as unknown as QuizClient,
      );

      expect(
        anotherInstance.verifyMembershipToken(room.roomId, userId, accessToken),
      ).toBe(true);
    });

    it('같은 계정이 다른 기기로 재입장해도 이전에 발급된 토큰이 계속 유효하다', async () => {
      const {
        room,
        userId: hostUserId,
        accessToken: firstDeviceToken,
      } = await roomService.createRoom(
        {
          roomTtl: '아이유 방',
          quizId: '1',
          isRandom: false,
          speedModeEnabled: false,
          maxUserCnt: 4,
          nickname: '방장',
        },
        'account-user-1',
      );

      // 같은 계정이 다른 기기(새 소켓)로 재입장 -> joinRoom이 다시 호출된다.
      await roomService.joinRoom(
        room.roomId,
        { nickname: '방장' },
        'account-user-1',
      );

      expect(
        roomService.verifyMembershipToken(
          room.roomId,
          hostUserId,
          firstDeviceToken,
        ),
      ).toBe(true);
    });

    it('퇴장한 뒤에도 토큰 자체는 여전히 서명이 유효하다(참가자 목록에서 빠지는 것이 실제 게이트)', async () => {
      const { room, userId, accessToken } = await createTestRoom();
      await roomService.joinRoom(room.roomId, { nickname: '참가자1' });

      await roomService.leaveRoom(room.roomId, userId);
      const roomAfterLeave = await roomService.getRoom(room.roomId);

      expect(
        roomService.verifyMembershipToken(room.roomId, userId, accessToken),
      ).toBe(true);
      expect(
        roomAfterLeave?.participants.some((p) => p.userId === userId),
      ).toBe(false);
    });
  });
});
