import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { CacheService } from '../cache/cache.service';
import { delay } from '../common/delay';
import { FakeRedis } from '../common/testing/fake-redis';
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
  let roomTimerService: RoomTimerService;

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
    roomTimerService = app.get<RoomTimerService>(RoomTimerService);
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

  describe('방 생성/입장/퇴장', () => {
    it('방을 생성하면 방장이 참가자로 포함되고 아티스트 정보가 채워진다', async () => {
      const result = await createTestRoom();

      expect(result.room.quizTtl).toBe('아이유');
      expect(result.room.quizDesc).toBe('아이유 노래 맞추기');
      expect(result.room.songCount).toBe(2);
      expect(result.room.songLimit).toBe(2);
      expect(result.room.atstIds).toEqual(['10']);
      expect(result.room.atstNms).toEqual(['아이유']);
      expect(result.room.curUserCnt).toBe(1);
      expect(result.room.hostUserId).toBe(result.userId);
      expect(result.room.gameStatus).toBe('WAITING');
      expect(result.room.currentRound).toBeNull();
      expect(result.room.participants).toEqual([
        {
          userId: result.userId,
          nickname: '방장',
          score: 0,
          isAccount: false,
        },
      ]);
    });

    it('accountUserId를 전달해 생성하면(로그인 유저) 그 값을 hostUserId로 그대로 쓴다', async () => {
      const result = await roomService.createRoom(
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

      expect(result.userId).toBe('account-user-1');
      expect(result.room.hostUserId).toBe('account-user-1');
    });

    it('songLimit을 지정하지 않으면 퀴즈 전체 출제곡 수를 그대로 쓴다', async () => {
      const result = await createTestRoom();

      expect(result.room.songLimit).toBe(2);
    });

    it('songLimit을 지정하면 방에 그 값이 저장된다', async () => {
      const result = await createTestRoom(4, false, 1);

      expect(result.room.songLimit).toBe(1);
      expect(result.room.songCount).toBe(2);
    });

    it('songLimit이 퀴즈 전체 출제곡 수를 초과하면 BadRequestException', async () => {
      await expect(createTestRoom(4, false, 3)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('존재하지 않는 퀴즈로 생성하면 NotFoundException', async () => {
      quizClientMock.getSummary.mockRejectedValue(
        new NotFoundException('퀴즈를 찾을 수 없습니다.'),
      );

      await expect(
        roomService.createRoom({
          roomTtl: '방',
          quizId: '999',
          isRandom: false,
          speedModeEnabled: false,
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
        {
          userId: room.hostUserId,
          nickname: '방장',
          score: 0,
          isAccount: false,
        },
        {
          userId: joinResult.userId,
          nickname: '참가자1',
          score: 0,
          isAccount: false,
        },
      ]);
    });

    it('accountUserId를 전달해 입장하면(로그인 유저) 그 값을 참가자 userId로 그대로 쓴다', async () => {
      const { room } = await createTestRoom();

      const joinResult = await roomService.joinRoom(
        room.roomId,
        { nickname: '참가자1' },
        'account-user-1',
      );

      expect(joinResult.userId).toBe('account-user-1');
      expect(joinResult.room.participants).toEqual([
        {
          userId: room.hostUserId,
          nickname: '방장',
          score: 0,
          isAccount: false,
        },
        {
          userId: 'account-user-1',
          nickname: '참가자1',
          score: 0,
          isAccount: true,
        },
      ]);
    });

    it('이미 참가 중인 accountUserId로 다시 입장하면 중복 추가하지 않고 그대로 재입장시킨다', async () => {
      const { room } = await createTestRoom();
      await roomService.joinRoom(
        room.roomId,
        { nickname: '참가자1' },
        'account-user-1',
      );

      const rejoinResult = await roomService.joinRoom(
        room.roomId,
        { nickname: '참가자1' },
        'account-user-1',
      );

      expect(rejoinResult.userId).toBe('account-user-1');
      expect(rejoinResult.room.curUserCnt).toBe(2);
      expect(rejoinResult.room.participants).toHaveLength(2);
    });

    it('방이 가득 차도 이미 참가 중인 accountUserId면 재입장할 수 있다', async () => {
      const { room } = await createTestRoom(2);
      await roomService.joinRoom(
        room.roomId,
        { nickname: '참가자1' },
        'account-user-1',
      );

      const rejoinResult = await roomService.joinRoom(
        room.roomId,
        { nickname: '참가자1' },
        'account-user-1',
      );

      expect(rejoinResult.userId).toBe('account-user-1');
      expect(rejoinResult.room.participants).toHaveLength(2);
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

  /**
   * getRooms()의 room:index 정리(reconciliation)는 Redis가 실제로 있어야 의미 있게
   * 검증할 수 있다(로컬 폴백 모드에서는 get()이 실패할 일이 없다). 그래서 이 블록만
   * 상단 beforeEach의 REDIS_HOST 삭제/DI 인스턴스와 별개로, room.repository.spec.ts와
   * 같은 방식으로 FakeRedis를 끼운 별도의 인스턴스를 직접 구성해 쓴다.
   */
  describe('room:index 정리(reconciliation)와 Redis 일시 오류', () => {
    let redis: FakeRedis;
    let localCacheService: CacheService;
    let localRoomRepository: RoomRepository;
    let localRoomLockService: RoomLockService;
    let localRoomService: RoomService;

    beforeEach(() => {
      redis = new FakeRedis();
      localCacheService = new CacheService();
      Object.defineProperty(localCacheService, 'redis', {
        value: redis,
        writable: true,
      });
      Object.defineProperty(localCacheService, 'redisReady', {
        get: () => !redis.down,
      });

      localRoomLockService = new RoomLockService(localCacheService);
      localRoomRepository = new RoomRepository(
        localCacheService,
        localRoomLockService,
      );
      const localRoomTimerService = new RoomTimerService(localCacheService);
      const localRoomRoundService = new RoomRoundService(
        localRoomRepository,
        localRoomTimerService,
        quizClientMock as unknown as QuizClient,
      );
      localRoomService = new RoomService(
        localRoomRepository,
        localRoomRoundService,
        localRoomLockService,
        localRoomTimerService,
        quizClientMock as unknown as QuizClient,
      );
    });

    afterEach(async () => {
      localRoomLockService.onModuleDestroy();
      Object.defineProperty(localCacheService, 'redis', {
        value: null,
        writable: true,
      });
      await localCacheService.onApplicationShutdown();
    });

    it('room 레코드 조회가 일시적으로 실패해도(undefined로 폴백) 살아있는 방을 index에서 지우지 않는다', async () => {
      const { room } = await localRoomService.createRoom({
        roomTtl: '아이유 방',
        quizId: '1',
        isRandom: false,
        speedModeEnabled: false,
        maxUserCnt: 4,
        nickname: '방장',
      });

      // getRoomRecord()가 쓰는 get()만 실패시킨다(방 레코드는 Redis에 그대로 살아있다).
      redis.dataCommandsDown = true;
      const roomsDuringOutage = await localRoomService.getRooms();
      // 표시 목록에서는(로컬 폴백에도 값이 없으므로) 당장 빠질 수 있다 — 기존 동작 그대로.
      expect(roomsDuringOutage.map((r) => r.roomId)).not.toContain(room.roomId);

      // 백그라운드 정리(reconcileStaleIndexEntry)가 roomExistsStrict로 재확인하다가
      // 같은 오류를 만나면 판단을 유보해야 한다 — index에서 지우면 안 된다.
      // 정리 작업은 락 획득/조회/쓰기/해제까지 여러 await를 거치므로, 단순 마이크로
      // 태스크 flush(Promise.resolve 반복)로는 부족하다. 실제 타이머로 짧게 기다린다.
      await delay(50);

      redis.dataCommandsDown = false;
      const roomsAfterRecovery = await localRoomService.getRooms();
      expect(roomsAfterRecovery.map((r) => r.roomId)).toContain(room.roomId);
    });

    it('실제로 방 레코드가 사라진(TTL 자연 만료) stale roomId는 재조회 시 index에서 정리된다', async () => {
      const { room } = await localRoomService.createRoom({
        roomTtl: '아이유 방',
        quizId: '1',
        isRandom: false,
        speedModeEnabled: false,
        maxUserCnt: 4,
        nickname: '방장',
      });

      // removeFromIndex를 거치지 않고 room 레코드만 지워, TTL 자연 만료를 흉내낸다.
      await redis.del(`room:${room.roomId}`);

      const rooms = await localRoomService.getRooms();
      expect(rooms.map((r) => r.roomId)).not.toContain(room.roomId);

      // 정리 작업은 락 획득/조회/쓰기/해제까지 여러 await를 거치므로, 단순 마이크로
      // 태스크 flush(Promise.resolve 반복)로는 부족하다. 실제 타이머로 짧게 기다린다.
      await delay(50);

      expect(await localRoomRepository.getRoomIndex()).not.toContain(
        room.roomId,
      );
    });
  });

  describe('비공개방/비밀방', () => {
    it('isUnlisted로 생성한 방은 목록 조회에 나타나지 않지만 단건 조회는 그대로 된다', async () => {
      const { room } = await roomService.createRoom({
        roomTtl: '비공개방',
        quizId: '1',
        isRandom: false,
        speedModeEnabled: false,
        maxUserCnt: 4,
        nickname: '방장',
        isUnlisted: true,
      });

      const rooms = await roomService.getRooms();
      expect(rooms.map((r) => r.roomId)).not.toContain(room.roomId);

      const fetched = await roomService.getRoom(room.roomId);
      expect(fetched?.roomId).toBe(room.roomId);
    });

    it('isPrivate만 켜고 비밀번호를 지정하지 않으면 BadRequestException', async () => {
      await expect(
        roomService.createRoom({
          roomTtl: '비밀방',
          quizId: '1',
          isRandom: false,
          speedModeEnabled: false,
          maxUserCnt: 4,
          nickname: '방장',
          isPrivate: true,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('비밀방 생성 응답과 목록/단건 조회 응답에 비밀번호 해시가 노출되지 않는다', async () => {
      const { room } = await roomService.createRoom({
        roomTtl: '비밀방',
        quizId: '1',
        isRandom: false,
        speedModeEnabled: false,
        maxUserCnt: 4,
        nickname: '방장',
        isPrivate: true,
        password: 'secret1234',
      });

      expect(room).not.toHaveProperty('pwdHash');
      const fetched = await roomService.getRoom(room.roomId);
      expect(fetched).not.toHaveProperty('pwdHash');
    });

    it('비밀방에 잘못된 비밀번호로 입장하면 UnauthorizedException', async () => {
      const { room } = await roomService.createRoom({
        roomTtl: '비밀방',
        quizId: '1',
        isRandom: false,
        speedModeEnabled: false,
        maxUserCnt: 4,
        nickname: '방장',
        isPrivate: true,
        password: 'secret1234',
      });

      await expect(
        roomService.joinRoom(room.roomId, {
          nickname: '참가자1',
          password: '틀린비번',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('비밀방에 올바른 비밀번호로 입장하면 정상 입장된다', async () => {
      const { room } = await roomService.createRoom({
        roomTtl: '비밀방',
        quizId: '1',
        isRandom: false,
        speedModeEnabled: false,
        maxUserCnt: 4,
        nickname: '방장',
        isPrivate: true,
        password: 'secret1234',
      });

      const joinResult = await roomService.joinRoom(room.roomId, {
        nickname: '참가자1',
        password: 'secret1234',
      });

      expect(joinResult.room.curUserCnt).toBe(2);
    });

    it('같은 방+IP에서 비밀번호를 5회 틀리면 429(TOO_MANY_REQUESTS)를 던지고, 다른 IP는 영향받지 않는다', async () => {
      const { room } = await roomService.createRoom({
        roomTtl: '비밀방',
        quizId: '1',
        isRandom: false,
        speedModeEnabled: false,
        maxUserCnt: 50,
        nickname: '방장',
        isPrivate: true,
        password: 'secret1234',
      });

      for (let i = 0; i < 5; i++) {
        await expect(
          roomService.joinRoom(
            room.roomId,
            { nickname: `참가자${i}`, password: '틀린비번' },
            undefined,
            '1.2.3.4',
          ),
        ).rejects.toThrow(UnauthorizedException);
      }

      const sixthAttempt = roomService.joinRoom(
        room.roomId,
        { nickname: '참가자6', password: 'secret1234' },
        undefined,
        '1.2.3.4',
      );
      await expect(sixthAttempt).rejects.toThrow(HttpException);
      await expect(sixthAttempt).rejects.toMatchObject({
        status: HttpStatus.TOO_MANY_REQUESTS,
      });

      // 다른 IP는 별도로 집계되므로 정상 입장할 수 있다.
      const otherIpResult = await roomService.joinRoom(
        room.roomId,
        { nickname: '참가자7', password: 'secret1234' },
        undefined,
        '5.6.7.8',
      );
      expect(otherIpResult.room.curUserCnt).toBe(2);
    });

    it('비밀번호를 맞히면 실패 횟수 집계가 초기화된다', async () => {
      const { room } = await roomService.createRoom({
        roomTtl: '비밀방',
        quizId: '1',
        isRandom: false,
        speedModeEnabled: false,
        maxUserCnt: 50,
        nickname: '방장',
        isPrivate: true,
        password: 'secret1234',
      });
      const attemptCacheKey = `room:pwd-attempts:${room.roomId}:1.2.3.4`;

      for (let i = 0; i < 4; i++) {
        await expect(
          roomService.joinRoom(
            room.roomId,
            { nickname: `참가자${i}`, password: '틀린비번' },
            undefined,
            '1.2.3.4',
          ),
        ).rejects.toThrow(UnauthorizedException);
      }
      expect(await cacheService.get(attemptCacheKey)).toBe(4);

      await roomService.joinRoom(
        room.roomId,
        { nickname: '참가자성공', password: 'secret1234' },
        undefined,
        '1.2.3.4',
      );

      expect(await cacheService.get(attemptCacheKey)).toBeUndefined();
    });

    it('공개방 입장은 같은 IP로 여러 번 반복해도 429가 발생하지 않는다', async () => {
      const { room } = await createTestRoom(50);

      for (let i = 0; i < 12; i++) {
        await expect(
          roomService.joinRoom(
            room.roomId,
            { nickname: `참가자${i}` },
            undefined,
            '1.2.3.4',
          ),
        ).resolves.toBeDefined();
      }
    });
  });

  describe('레거시 방 데이터 하위 호환(배포 전에 생성된 방)', () => {
    it('isPrivate/isUnlisted/참가자 isAccount가 없는 캐시 데이터도 false로 보정해 조회/수정된다', async () => {
      const { room, userId: hostUserId, accessToken } = await createTestRoom();

      // 비공개방/비밀방 기능 배포 이전에 만들어진 방을 흉내내, 해당 필드들을
      // 캐시에서 지운다(JSON 직렬화 캐시라 실제로도 이런 모양으로 남아있을 수 있다).
      const legacyRoom = await cacheService.get<Record<string, unknown>>(
        `room:${room.roomId}`,
      );
      delete legacyRoom!.isPrivate;
      delete legacyRoom!.isUnlisted;
      delete legacyRoom!.pwdHash;
      legacyRoom!.participants = (
        legacyRoom!.participants as Record<string, unknown>[]
      )
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        .map(({ isAccount, ...rest }) => rest);
      await cacheService.set(`room:${room.roomId}`, legacyRoom);

      const fetched = await roomService.getRoom(room.roomId);
      expect(fetched?.isPrivate).toBe(false);
      expect(fetched?.isUnlisted).toBe(false);

      const updated = await roomService.updateRoom(room.roomId, {
        userId: hostUserId,
        accessToken,
        roomTtl: '레거시 방 수정',
        quizId: room.quizId,
        isRandom: false,
        speedModeEnabled: false,
        maxUserCnt: room.maxUserCnt,
        isUnlisted: false,
        isPrivate: false,
      });
      expect(updated.roomTtl).toBe('레거시 방 수정');
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
      expect(quizClientMock.incrementPlayCount).not.toHaveBeenCalled();
    });

    it('songLimit을 지정해 방을 만들면 게임 시작 시 그만큼만 라운드가 진행된다', async () => {
      const { room, userId: hostUserId } = await createTestRoom(4, false, 1);

      const started = await roomService.startGame(room.roomId, hostUserId);

      expect(started.currentRound?.totalRounds).toBe(1);
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
      expect(quizClientMock.incrementPlayCount).toHaveBeenCalledWith(
        room.quizId,
      );
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
        new Date(afterGuestReady.currentRound!.playScheduledAt!).getTime(),
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
      expect(afterRepeatedSkip.currentRound?.skipUserIds).toEqual([hostUserId]);
    });

    it('제한 시간이 지나면 라운드가 자동 종료된다', async () => {
      jest.useFakeTimers();
      try {
        const { room, userId: hostUserId } = await createTestRoom(1);
        await roomService.startGame(room.roomId, hostUserId);
        await roomService.markReady(room.roomId, hostUserId);

        // 라운드 제한시간(30초) + 재생 예약 유예시간(1.8초)
        await jest.advanceTimersByTimeAsync(31_800);

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

  describe('다시하기(restartGame)', () => {
    async function finishTestGame(hostUserId: string, roomId: string) {
      await roomService.startGame(roomId, hostUserId);
      await roomService.markReady(roomId, hostUserId);
      await roomService.submitChatMessage(roomId, hostUserId, '노래1');
      await roomService.nextRound(roomId, hostUserId);

      await roomService.markReady(roomId, hostUserId);
      await roomService.submitChatMessage(roomId, hostUserId, '노래2');
      return roomService.nextRound(roomId, hostUserId);
    }

    it('게임 종료 후 방장이 다시하기를 하면 점수가 초기화되고 첫 라운드부터 다시 시작된다', async () => {
      const { room, userId: hostUserId } = await createTestRoom(1);
      const finished = await finishTestGame(hostUserId, room.roomId);
      expect(
        finished.participants.find((p) => p.userId === hostUserId)?.score,
      ).toBeGreaterThan(0);

      const restarted = await roomService.restartGame(room.roomId, hostUserId);

      expect(restarted.gameStatus).toBe('LOADING');
      expect(restarted.currentRound?.roundIndex).toBe(0);
      expect(restarted.currentRound?.totalRounds).toBe(2);
      expect(
        restarted.participants.find((p) => p.userId === hostUserId)?.score,
      ).toBe(0);
    });

    it('방장이 아니면 다시하기를 할 수 없다', async () => {
      const { room, userId: hostUserId } = await createTestRoom(2);
      await finishTestGame(hostUserId, room.roomId);
      const { userId: guestUserId } = await roomService.joinRoom(room.roomId, {
        nickname: '참가자1',
      });

      await expect(
        roomService.restartGame(room.roomId, guestUserId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('게임이 종료되지 않은 상태에서는 다시하기를 할 수 없다', async () => {
      const { room, userId: hostUserId } = await createTestRoom();

      await expect(
        roomService.restartGame(room.roomId, hostUserId),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('스피드 모드', () => {
    it('한 명만 정답을 맞혀도 6초 뒤 자동으로 정답이 공개되고, 공개 4초 뒤 자동으로 다음 라운드로 넘어간다', async () => {
      jest.useFakeTimers();
      try {
        const { room, userId: hostUserId } = await createTestRoom(2, true);
        const { userId: guestUserId } = await roomService.joinRoom(
          room.roomId,
          { nickname: '참가자1' },
        );
        await roomService.startGame(room.roomId, hostUserId);
        await roomService.markReady(room.roomId, hostUserId);
        await roomService.markReady(room.roomId, guestUserId);

        const result = await roomService.submitChatMessage(
          room.roomId,
          hostUserId,
          '노래1',
        );
        expect(result.action).toBe('correct');

        const afterAnswer = await roomService.getRoom(room.roomId);
        expect(afterAnswer?.gameStatus).toBe('PLAYING');
        expect(afterAnswer?.currentRound?.revealed).toBe(false);
        expect(afterAnswer?.currentRound?.autoRevealAt).not.toBeNull();

        await jest.advanceTimersByTimeAsync(6_000);

        const afterReveal = await roomService.getRoom(room.roomId);
        expect(afterReveal?.gameStatus).toBe('ROUND_ENDED');
        expect(afterReveal?.currentRound?.revealed).toBe(true);
        expect(afterReveal?.currentRound?.songNm).toBe('노래1');
        expect(afterReveal?.currentRound?.autoNextRoundAt).not.toBeNull();

        await jest.advanceTimersByTimeAsync(4_000);

        const afterAutoNext = await roomService.getRoom(room.roomId);
        expect(afterAutoNext?.gameStatus).toBe('LOADING');
        expect(afterAutoNext?.currentRound?.roundIndex).toBe(1);
      } finally {
        jest.useRealTimers();
      }
    });

    it('스피드 모드가 꺼져 있으면 한 명만 정답을 맞혀도 자동 공개되지 않는다', async () => {
      jest.useFakeTimers();
      try {
        const { room, userId: hostUserId } = await createTestRoom(2, false);
        const { userId: guestUserId } = await roomService.joinRoom(
          room.roomId,
          { nickname: '참가자1' },
        );
        await roomService.startGame(room.roomId, hostUserId);
        await roomService.markReady(room.roomId, hostUserId);
        await roomService.markReady(room.roomId, guestUserId);

        await roomService.submitChatMessage(room.roomId, hostUserId, '노래1');

        const afterAnswer = await roomService.getRoom(room.roomId);
        expect(afterAnswer?.currentRound?.autoRevealAt).toBeNull();

        await jest.advanceTimersByTimeAsync(6_000);

        const afterWait = await roomService.getRoom(room.roomId);
        expect(afterWait?.gameStatus).toBe('PLAYING');
        expect(afterWait?.currentRound?.revealed).toBe(false);
      } finally {
        jest.useRealTimers();
      }
    });

    it('전원이 정답을 맞혀 즉시 라운드가 끝나도, 스피드 모드가 켜져 있으면 4초 뒤 자동으로 다음 라운드로 넘어간다', async () => {
      jest.useFakeTimers();
      try {
        const { room, userId: hostUserId } = await createTestRoom(1, true);
        await roomService.startGame(room.roomId, hostUserId);
        await roomService.markReady(room.roomId, hostUserId);

        await roomService.submitChatMessage(room.roomId, hostUserId, '노래1');

        const afterAnswer = await roomService.getRoom(room.roomId);
        expect(afterAnswer?.gameStatus).toBe('ROUND_ENDED');
        expect(afterAnswer?.currentRound?.autoNextRoundAt).not.toBeNull();

        await jest.advanceTimersByTimeAsync(4_000);

        const afterAutoNext = await roomService.getRoom(room.roomId);
        expect(afterAutoNext?.gameStatus).toBe('LOADING');
        expect(afterAutoNext?.currentRound?.roundIndex).toBe(1);
      } finally {
        jest.useRealTimers();
      }
    });

    it('방장이 라운드를 직접 넘긴 뒤에도 다음 라운드에서 스피드 모드가 계속 정상 동작한다', async () => {
      jest.useFakeTimers();
      try {
        const { room, userId: hostUserId } = await createTestRoom(1, true);
        await roomService.startGame(room.roomId, hostUserId);
        await roomService.markReady(room.roomId, hostUserId);
        await roomService.submitChatMessage(room.roomId, hostUserId, '노래1');

        await roomService.nextRound(room.roomId, hostUserId);
        await roomService.markReady(room.roomId, hostUserId);
        await roomService.submitChatMessage(room.roomId, hostUserId, '노래2');

        await jest.advanceTimersByTimeAsync(4_000);

        const roomAfter = await roomService.getRoom(room.roomId);
        expect(roomAfter?.gameStatus).toBe('FINISHED');
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('닉네임 변경(updateNickname)', () => {
    it('참가자가 닉네임을 변경하면 참가자 목록에 반영된다', async () => {
      const { room, userId: hostUserId } = await createTestRoom();

      const updated = await roomService.updateNickname(
        room.roomId,
        hostUserId,
        '새닉네임',
      );

      expect(
        updated.participants.find((p) => p.userId === hostUserId)?.nickname,
      ).toBe('새닉네임');
    });

    it('방에 없는 유저가 닉네임 변경을 시도하면 NotFoundException', async () => {
      const { room } = await createTestRoom();

      await expect(
        roomService.updateNickname(
          room.roomId,
          '존재하지-않는-유저',
          '새닉네임',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('로그인 계정으로 참가한 유저가 닉네임 변경을 시도하면 ForbiddenException(헤더 생략으로 우회 불가)', async () => {
      const { room } = await createTestRoom();
      const { userId: accountUserId } = await roomService.joinRoom(
        room.roomId,
        { nickname: '계정유저' },
        'account-user-1',
      );

      await expect(
        roomService.updateNickname(room.roomId, accountUserId, '새닉네임'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('기존과 같은 닉네임으로 변경하면 room-updated 이벤트 없이 그대로 반환한다', async () => {
      const { room, userId: hostUserId } = await createTestRoom();
      const listener = jest.fn();
      roomService.on('room-updated', listener);

      const updated = await roomService.updateNickname(
        room.roomId,
        hostUserId,
        '방장',
      );

      expect(updated.hostUserId).toBe(hostUserId);
      expect(listener).not.toHaveBeenCalled();
    });

    it('닉네임을 변경하면 nickname-changed 이벤트가 이전/새 닉네임과 함께 발생한다', async () => {
      const { room, userId: hostUserId } = await createTestRoom();
      const listener = jest.fn();
      roomService.on('nickname-changed', listener);

      await roomService.updateNickname(room.roomId, hostUserId, '새닉네임');

      expect(listener).toHaveBeenCalledWith({
        roomId: room.roomId,
        userId: hostUserId,
        oldNickname: '방장',
        newNickname: '새닉네임',
      });
    });
  });

  describe('방 정보 수정(updateRoom)', () => {
    function updateDto(
      room: { quizId: string },
      userId: string,
      accessToken: string,
      overrides: Partial<{
        roomTtl: string;
        maxUserCnt: number;
        speedModeEnabled: boolean;
        isUnlisted: boolean;
        isPrivate: boolean;
        password?: string;
        songLimit?: number;
      }> = {},
    ) {
      return {
        userId,
        accessToken,
        roomTtl: overrides.roomTtl ?? '수정된 방 제목',
        quizId: room.quizId,
        isRandom: false,
        speedModeEnabled: overrides.speedModeEnabled ?? false,
        maxUserCnt: overrides.maxUserCnt ?? 4,
        songLimit: overrides.songLimit,
        isUnlisted: overrides.isUnlisted ?? false,
        isPrivate: overrides.isPrivate ?? false,
        password: overrides.password,
      };
    }

    it('WAITING 상태에서 방장이 방 정보를 수정할 수 있다', async () => {
      const { room, userId, accessToken } = await createTestRoom();

      const updated = await roomService.updateRoom(
        room.roomId,
        updateDto(room, userId, accessToken, { roomTtl: '새 제목' }),
      );

      expect(updated.roomTtl).toBe('새 제목');
    });

    it('FINISHED 상태에서도 방 정보를 수정할 수 있다', async () => {
      const { room, userId, accessToken } = await createTestRoom(1);
      await roomService.startGame(room.roomId, userId);
      await roomService.markReady(room.roomId, userId);
      await roomService.submitChatMessage(room.roomId, userId, '노래1');
      await roomService.nextRound(room.roomId, userId);
      await roomService.markReady(room.roomId, userId);
      await roomService.submitChatMessage(room.roomId, userId, '노래2');
      await roomService.nextRound(room.roomId, userId);

      const midRoom = await roomService.getRoom(room.roomId);
      expect(midRoom?.gameStatus).toBe('FINISHED');

      const updated = await roomService.updateRoom(
        room.roomId,
        updateDto(room, userId, accessToken, { roomTtl: '새 제목' }),
      );
      expect(updated.roomTtl).toBe('새 제목');
    });

    it('게임 진행 중(WAITING/FINISHED가 아님)에는 ConflictException', async () => {
      const { room, userId, accessToken } = await createTestRoom();
      await roomService.startGame(room.roomId, userId);

      await expect(
        roomService.updateRoom(
          room.roomId,
          updateDto(room, userId, accessToken),
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('방장이 아니면 ForbiddenException', async () => {
      const { room } = await createTestRoom();
      const { userId: guestUserId, accessToken: guestToken } =
        await roomService.joinRoom(room.roomId, { nickname: '참가자1' });

      await expect(
        roomService.updateRoom(
          room.roomId,
          updateDto(room, guestUserId, guestToken),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('maxUserCnt를 현재 참가 인원 미만으로 줄이면 BadRequestException', async () => {
      const { room, userId, accessToken } = await createTestRoom(4);
      await roomService.joinRoom(room.roomId, { nickname: '참가자1' });
      await roomService.joinRoom(room.roomId, { nickname: '참가자2' });

      await expect(
        roomService.updateRoom(
          room.roomId,
          updateDto(room, userId, accessToken, { maxUserCnt: 1 }),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('공개방을 비밀번호 없이 비밀방으로 바꾸려 하면 BadRequestException', async () => {
      const { room, userId, accessToken } = await createTestRoom();

      await expect(
        roomService.updateRoom(
          room.roomId,
          updateDto(room, userId, accessToken, { isPrivate: true }),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('비밀방으로 수정한 뒤에는 비밀번호가 있어야 입장할 수 있다', async () => {
      const { room, userId, accessToken } = await createTestRoom();

      await roomService.updateRoom(
        room.roomId,
        updateDto(room, userId, accessToken, {
          isPrivate: true,
          password: 'newpass1',
        }),
      );

      await expect(
        roomService.joinRoom(room.roomId, { nickname: '참가자1' }),
      ).rejects.toThrow(UnauthorizedException);

      const joinResult = await roomService.joinRoom(room.roomId, {
        nickname: '참가자1',
        password: 'newpass1',
      });
      expect(joinResult.room.curUserCnt).toBe(2);
    });

    it('비밀방을 비밀번호 재입력 없이 다시 수정해도 기존 비밀번호가 유지된다', async () => {
      const { room, userId, accessToken } = await createTestRoom();
      await roomService.updateRoom(
        room.roomId,
        updateDto(room, userId, accessToken, {
          isPrivate: true,
          password: 'keepme1',
        }),
      );

      await roomService.updateRoom(
        room.roomId,
        updateDto(room, userId, accessToken, {
          isPrivate: true,
          roomTtl: '제목만 변경',
        }),
      );

      const joinResult = await roomService.joinRoom(room.roomId, {
        nickname: '참가자1',
        password: 'keepme1',
      });
      expect(joinResult.room.curUserCnt).toBe(2);
    });

    it('비밀방을 공개로 전환하면 비밀번호 없이 입장할 수 있다', async () => {
      const { room, userId, accessToken } = await createTestRoom();
      await roomService.updateRoom(
        room.roomId,
        updateDto(room, userId, accessToken, {
          isPrivate: true,
          password: 'keepme1',
        }),
      );

      await roomService.updateRoom(
        room.roomId,
        updateDto(room, userId, accessToken, { isPrivate: false }),
      );

      const joinResult = await roomService.joinRoom(room.roomId, {
        nickname: '참가자1',
      });
      expect(joinResult.room.curUserCnt).toBe(2);
    });
  });
});
