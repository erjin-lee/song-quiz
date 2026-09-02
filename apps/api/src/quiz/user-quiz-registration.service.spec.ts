import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../notification/notification.constants';
import { User } from '../user/entities/user.entity';
import { UserService } from '../user/user.service';
import { QuizAnswer } from './entities/quiz-answer.entity';
import { QuizArtist } from './entities/quiz-artist.entity';
import { QuizSong } from './entities/quiz-song.entity';
import { Quiz } from './entities/quiz.entity';
import { Song } from './entities/song.entity';
import { MIN_USER_QUIZ_SONG_COUNT } from './quiz.constants';
import { UserQuizRegistrationService } from './user-quiz-registration.service';
import { YoutubeLinkValidationService } from './youtube-link-validation.service';

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function makeSongInput(
  songId: string,
  overrides: Partial<Record<string, unknown>> = {},
) {
  return {
    songId,
    youtubeUrl: `https://www.youtube.com/watch?v=v${songId}&t=10`,
    answers: [`정답${songId}`],
    ...overrides,
  };
}

describe('UserQuizRegistrationService', () => {
  let service: UserQuizRegistrationService;

  // manager는 트랜잭션 콜백에 그대로 넘겨주는 값으로도, quizRepository.manager로
  // 직접 쓰는 값(안전망 백그라운드 작업, getEligibility)으로도 재사용한다 -
  // 실제 TypeORM에서도 트랜잭션 매니저는 같은 커넥션 위의 또 다른 EntityManager일 뿐이다.
  const managerMock: Record<string, jest.Mock> = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    create: jest.fn((_entity, data) => data),
    delete: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  managerMock.transaction = jest.fn(async (cb: (m: unknown) => unknown) =>
    cb(managerMock),
  );

  const quizRepositoryMock = {
    findOne: jest.fn(),
    save: jest.fn(),
    manager: managerMock,
  };
  const userServiceMock = { findUserKeyByUserId: jest.fn() };
  const youtubeLinkValidationServiceMock = { validate: jest.fn() };
  const notificationServiceMock = { create: jest.fn() };

  function makeQueryBuilder(songsWithArtists: unknown[]) {
    const qb: Record<string, jest.Mock> = {};
    qb.innerJoinAndSelect = jest.fn().mockReturnValue(qb);
    qb.where = jest.fn().mockReturnValue(qb);
    qb.getMany = jest.fn().mockResolvedValue(songsWithArtists);
    return qb;
  }

  let userLockResult: unknown = { userKey: 'user-key-1' };
  let lastQuizResult: unknown = null;
  let ownedQuizResult: unknown = null;
  let songsFindResult: unknown[] = [];
  let existingQuizSongIds: { quizSongId: string }[] = [];

  beforeEach(async () => {
    jest.clearAllMocks();

    userLockResult = { userKey: 'user-key-1' };
    lastQuizResult = null;
    ownedQuizResult = null;
    songsFindResult = [];
    existingQuizSongIds = [];

    userServiceMock.findUserKeyByUserId.mockResolvedValue('user-key-1');

    // findOne은 createQuiz(User 락 -> Quiz 최근 등록 조회)와 updateQuiz(Quiz
    // 소유권 조회)에서 각각 다른 엔티티로 호출된다 - 첫 인자로 분기한다.
    managerMock.findOne.mockImplementation((entity: unknown) => {
      if (entity === User) return Promise.resolve(userLockResult);
      if (entity === Quiz) {
        return Promise.resolve(ownedQuizResult ?? lastQuizResult);
      }
      return Promise.resolve(null);
    });
    managerMock.find.mockImplementation((entity: unknown) => {
      if (entity === Song) return Promise.resolve(songsFindResult);
      if (entity === QuizSong) return Promise.resolve(existingQuizSongIds);
      return Promise.resolve([]);
    });
    managerMock.save.mockImplementation((entity: unknown, data: unknown) => {
      if (entity === Quiz) {
        return Promise.resolve({
          quizId: 'quiz-1',
          crtDt: new Date(),
          ...(data as object),
        });
      }
      if (entity === QuizSong) {
        const d = data as { songId: string };
        return Promise.resolve({ quizSongId: `qs-${d.songId}`, ...d });
      }
      return Promise.resolve(data);
    });
    managerMock.createQueryBuilder.mockReturnValue(makeQueryBuilder([]));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserQuizRegistrationService,
        { provide: getRepositoryToken(Quiz), useValue: quizRepositoryMock },
        { provide: UserService, useValue: userServiceMock },
        {
          provide: YoutubeLinkValidationService,
          useValue: youtubeLinkValidationServiceMock,
        },
        { provide: NotificationService, useValue: notificationServiceMock },
      ],
    }).compile();

    service = module.get<UserQuizRegistrationService>(
      UserQuizRegistrationService,
    );
  });

  describe('getEligibility', () => {
    it('이전에 등록한 퀴즈가 없으면 바로 등록 가능하다', async () => {
      lastQuizResult = null;

      const result = await service.getEligibility('user-1');

      expect(result).toEqual({ eligible: true, remainingSeconds: 0 });
    });

    it('24시간이 지나지 않았으면 남은 시간을 반환한다', async () => {
      lastQuizResult = { crtDt: new Date(Date.now() - 60 * 60 * 1000) };

      const result = await service.getEligibility('user-1');

      expect(result.eligible).toBe(false);
      expect(result.remainingSeconds).toBeGreaterThan(0);
      expect(result.remainingSeconds).toBeLessThanOrEqual(23 * 60 * 60);
    });

    it('24시간이 지났으면 다시 등록 가능하다', async () => {
      lastQuizResult = { crtDt: new Date(Date.now() - 25 * 60 * 60 * 1000) };

      const result = await service.getEligibility('user-1');

      expect(result).toEqual({ eligible: true, remainingSeconds: 0 });
    });

    it('계정을 찾을 수 없으면 UnauthorizedException을 던진다', async () => {
      userServiceMock.findUserKeyByUserId.mockResolvedValue(null);

      await expect(service.getEligibility('unknown')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('createQuiz', () => {
    const baseDto = {
      quizTtl: '내 퀴즈',
      songs: Array.from({ length: MIN_USER_QUIZ_SONG_COUNT }, (_, i) =>
        makeSongInput(String(i + 1)),
      ),
    };

    beforeEach(() => {
      songsFindResult = baseDto.songs.map((s) => ({
        songId: s.songId,
        songNm: `곡${s.songId}`,
      }));
      youtubeLinkValidationServiceMock.validate.mockResolvedValue({
        valid: true,
        durationSec: 200,
        startSec: 10,
        endSec: 40,
      });
    });

    it(`최소 곡 수(${MIN_USER_QUIZ_SONG_COUNT}) 미만이면 거부한다`, async () => {
      await expect(
        service.createQuiz('user-1', {
          ...baseDto,
          songs: baseDto.songs.slice(0, MIN_USER_QUIZ_SONG_COUNT - 1),
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('같은 곡이 중복되면 거부한다', async () => {
      const dupSongs = [...baseDto.songs];
      dupSongs[1] = { ...dupSongs[1], songId: dupSongs[0].songId };

      await expect(
        service.createQuiz('user-1', { ...baseDto, songs: dupSongs }),
      ).rejects.toThrow(BadRequestException);
    });

    it('계정을 찾을 수 없으면 UnauthorizedException을 던진다', async () => {
      userLockResult = null;

      await expect(service.createQuiz('user-1', baseDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('24시간 제한에 걸리면 429를 던진다', async () => {
      lastQuizResult = { crtDt: new Date(Date.now() - 60 * 1000) };

      await expect(service.createQuiz('user-1', baseDto)).rejects.toThrow(
        HttpException,
      );
    });

    it('존재하지 않는 곡이 포함되면 거부한다', async () => {
      songsFindResult = baseDto.songs
        .slice(1)
        .map((s) => ({ songId: s.songId, songNm: 'x' }));

      await expect(service.createQuiz('user-1', baseDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('유튜브 링크 형식이 올바르지 않은 곡이 있으면 거부한다', async () => {
      await expect(
        service.createQuiz('user-1', {
          ...baseDto,
          songs: [
            makeSongInput('1', { youtubeUrl: 'not-a-youtube-url' }),
            ...baseDto.songs.slice(1),
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('정상 요청이면 퀴즈/출제곡/정답을 저장하고 quizId를 반환한다', async () => {
      const result = await service.createQuiz('user-1', baseDto);

      expect(result).toEqual({ quizId: 'quiz-1' });
      expect(managerMock.save).toHaveBeenCalledWith(
        Quiz,
        expect.objectContaining({
          quizTtl: '내 퀴즈',
          crtUserKey: 'user-key-1',
        }),
      );
      expect(managerMock.save).toHaveBeenCalledWith(
        QuizSong,
        expect.anything(),
      );
      expect(
        managerMock.save.mock.calls.filter(([entity]) => entity === QuizSong)
          .length,
      ).toBe(MIN_USER_QUIZ_SONG_COUNT);
    });

    it('저장 값은 클라이언트가 보낸 원본이 아니라 videoId로 재구성한 URL/영상 ID를 쓴다', async () => {
      await service.createQuiz('user-1', {
        ...baseDto,
        songs: [
          makeSongInput('1', {
            youtubeUrl:
              'https://www.youtube.com/watch?v=realvid&t=5&extra=evil',
          }),
          ...baseDto.songs.slice(1),
        ],
      });

      expect(managerMock.save).toHaveBeenCalledWith(
        QuizSong,
        expect.objectContaining({
          youtubeVideoId: 'realvid',
          youtubeUrl: expect.not.stringContaining('extra=evil'),
        }),
      );
    });

    it('안전망 재검증이 전부 통과하면 제외 없이 완료 알림을 보낸다', async () => {
      await service.createQuiz('user-1', baseDto);
      await flushMicrotasks();

      expect(notificationServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          notiType: NotificationType.QUIZ_REG_COMPLETED,
          userKey: 'user-key-1',
          title: '퀴즈 등록이 완료됐어요',
          linkPath: '/quizzes/quiz-1/edit',
        }),
      );
    });

    it('안전망 재검증에서 실패한 곡은 제외하고 알림에 사유를 포함한다', async () => {
      youtubeLinkValidationServiceMock.validate
        .mockResolvedValueOnce({
          valid: false,
          reason: '영상을 찾을 수 없습니다.',
        })
        .mockResolvedValue({
          valid: true,
          durationSec: 200,
          startSec: 10,
          endSec: 40,
        });

      await service.createQuiz('user-1', baseDto);
      await flushMicrotasks();

      expect(
        managerMock.delete.mock.calls.filter(([entity]) => entity === QuizSong)
          .length,
      ).toBe(1);
      expect(notificationServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining('1곡 제외'),
          message: expect.stringContaining('영상을 찾을 수 없습니다.'),
        }),
      );
    });

    it('안전망 재검증은 항상 콘텐츠(제목) 검증까지 수행한다(클라이언트가 우회할 수 없음)', async () => {
      await service.createQuiz('user-1', baseDto);
      await flushMicrotasks();

      expect(youtubeLinkValidationServiceMock.validate).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
      );
      // 두 번째 인자(옵션) 없이 항상 같은 시그니처로 호출되는지 확인 - 과거에는
      // 세 번째 인자로 skipContentCheck를 넘겨 콘텐츠 검증을 건너뛸 수 있었다.
      expect(
        youtubeLinkValidationServiceMock.validate.mock.calls[0],
      ).toHaveLength(2);
    });
  });

  describe('updateQuiz', () => {
    const dto = {
      quizTtl: '수정된 제목',
      songs: Array.from({ length: MIN_USER_QUIZ_SONG_COUNT }, (_, i) =>
        makeSongInput(String(i + 1)),
      ),
    };

    beforeEach(() => {
      songsFindResult = dto.songs.map((s) => ({
        songId: s.songId,
        songNm: `곡${s.songId}`,
      }));
      ownedQuizResult = { quizId: 'quiz-1', crtUserKey: 'user-key-1' };
      youtubeLinkValidationServiceMock.validate.mockResolvedValue({
        valid: true,
        durationSec: 200,
        startSec: 10,
        endSec: 40,
      });
    });

    it('본인 소유 퀴즈가 아니면 ForbiddenException을 던진다', async () => {
      ownedQuizResult = { quizId: 'quiz-1', crtUserKey: 'other-user' };

      await expect(service.updateQuiz('user-1', 'quiz-1', dto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('존재하지 않는 퀴즈면 NotFoundException을 던진다', async () => {
      ownedQuizResult = undefined;
      lastQuizResult = null;

      await expect(service.updateQuiz('user-1', 'quiz-1', dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('기존 출제곡/정답/아티스트 연결을 지우고 새로 저장한다', async () => {
      existingQuizSongIds = [{ quizSongId: 'old-1' }, { quizSongId: 'old-2' }];

      const result = await service.updateQuiz('user-1', 'quiz-1', dto);

      expect(managerMock.delete).toHaveBeenCalledWith(
        QuizAnswer,
        expect.anything(),
      );
      expect(managerMock.delete).toHaveBeenCalledWith(QuizSong, {
        quizId: 'quiz-1',
      });
      expect(managerMock.delete).toHaveBeenCalledWith(QuizArtist, {
        quizId: 'quiz-1',
      });
      expect(
        managerMock.save.mock.calls.filter(([entity]) => entity === QuizSong)
          .length,
      ).toBe(MIN_USER_QUIZ_SONG_COUNT);
      expect(result).toEqual({ quizId: 'quiz-1' });
    });

    it('최소 곡 수 미만이면 거부한다', async () => {
      await expect(
        service.updateQuiz('user-1', 'quiz-1', {
          ...dto,
          songs: dto.songs.slice(0, MIN_USER_QUIZ_SONG_COUNT - 1),
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('deleteQuiz', () => {
    it('본인 소유 퀴즈를 soft delete한다', async () => {
      const quiz = { quizId: 'quiz-1', crtUserKey: 'user-key-1', useYn: 'Y' };
      quizRepositoryMock.findOne.mockResolvedValue(quiz);
      quizRepositoryMock.save.mockImplementation(async (d) => d);

      await service.deleteQuiz('user-1', 'quiz-1');

      expect(quizRepositoryMock.save).toHaveBeenCalledWith(
        expect.objectContaining({ useYn: 'N' }),
      );
    });

    it('본인 소유가 아니면 ForbiddenException을 던진다', async () => {
      quizRepositoryMock.findOne.mockResolvedValue({
        quizId: 'quiz-1',
        crtUserKey: 'other-user',
      });

      await expect(service.deleteQuiz('user-1', 'quiz-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('존재하지 않으면 NotFoundException을 던진다', async () => {
      quizRepositoryMock.findOne.mockResolvedValue(null);

      await expect(service.deleteQuiz('user-1', 'quiz-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
