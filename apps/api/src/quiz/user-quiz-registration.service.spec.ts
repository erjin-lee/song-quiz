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
    youtubeVideoId: `v${songId}`,
    linkSource: 'MANUAL' as const,
    startSec: 10,
    endSec: 40,
    durationSec: 200,
    answers: [`정답${songId}`],
    ...overrides,
  };
}

describe('UserQuizRegistrationService', () => {
  let service: UserQuizRegistrationService;

  const quizRepositoryMock = {
    findOne: jest.fn(),
    create: jest.fn((d) => d),
    save: jest.fn(),
  };
  const quizSongRepositoryMock = {
    create: jest.fn((d) => d),
    save: jest.fn(),
    delete: jest.fn(),
    find: jest.fn(),
  };
  const quizAnswerRepositoryMock = {
    create: jest.fn((d) => d),
    save: jest.fn(),
    delete: jest.fn(),
  };
  const quizArtistRepositoryMock = {
    create: jest.fn((d) => d),
    save: jest.fn(),
    delete: jest.fn(),
  };
  const songRepositoryMock = {
    findBy: jest.fn(),
    createQueryBuilder: jest.fn(),
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

  beforeEach(async () => {
    jest.clearAllMocks();
    userServiceMock.findUserKeyByUserId.mockResolvedValue('user-key-1');
    quizSongRepositoryMock.save.mockImplementation(async (data) => ({
      quizSongId: `qs-${data.songId}`,
      ...data,
    }));
    quizRepositoryMock.save.mockImplementation(async (data) => ({
      quizId: 'quiz-1',
      crtDt: new Date(),
      ...data,
    }));
    songRepositoryMock.createQueryBuilder.mockReturnValue(makeQueryBuilder([]));
    quizSongRepositoryMock.find.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserQuizRegistrationService,
        { provide: getRepositoryToken(Quiz), useValue: quizRepositoryMock },
        {
          provide: getRepositoryToken(QuizSong),
          useValue: quizSongRepositoryMock,
        },
        {
          provide: getRepositoryToken(QuizAnswer),
          useValue: quizAnswerRepositoryMock,
        },
        {
          provide: getRepositoryToken(QuizArtist),
          useValue: quizArtistRepositoryMock,
        },
        { provide: getRepositoryToken(Song), useValue: songRepositoryMock },
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
      quizRepositoryMock.findOne.mockResolvedValue(null);

      const result = await service.getEligibility('user-1');

      expect(result).toEqual({ eligible: true, remainingSeconds: 0 });
    });

    it('24시간이 지나지 않았으면 남은 시간을 반환한다', async () => {
      quizRepositoryMock.findOne.mockResolvedValue({
        crtDt: new Date(Date.now() - 60 * 60 * 1000), // 1시간 전
      });

      const result = await service.getEligibility('user-1');

      expect(result.eligible).toBe(false);
      expect(result.remainingSeconds).toBeGreaterThan(0);
      expect(result.remainingSeconds).toBeLessThanOrEqual(23 * 60 * 60);
    });

    it('24시간이 지났으면 다시 등록 가능하다', async () => {
      quizRepositoryMock.findOne.mockResolvedValue({
        crtDt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      });

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
      quizRepositoryMock.findOne.mockResolvedValue(null);
      songRepositoryMock.findBy.mockResolvedValue(
        baseDto.songs.map((s) => ({
          songId: s.songId,
          songNm: `곡${s.songId}`,
        })),
      );
      youtubeLinkValidationServiceMock.validate.mockResolvedValue({
        valid: true,
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

    it('24시간 제한에 걸리면 429를 던진다', async () => {
      quizRepositoryMock.findOne.mockResolvedValue({
        crtDt: new Date(Date.now() - 60 * 1000),
      });

      await expect(service.createQuiz('user-1', baseDto)).rejects.toThrow(
        HttpException,
      );
    });

    it('존재하지 않는 곡이 포함되면 거부한다', async () => {
      songRepositoryMock.findBy.mockResolvedValue(
        baseDto.songs.slice(1).map((s) => ({ songId: s.songId, songNm: 'x' })),
      );

      await expect(service.createQuiz('user-1', baseDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('정상 요청이면 퀴즈/출제곡/정답을 저장하고 quizId를 반환한다', async () => {
      const result = await service.createQuiz('user-1', baseDto);

      expect(result).toEqual({ quizId: 'quiz-1' });
      expect(quizRepositoryMock.save).toHaveBeenCalledWith(
        expect.objectContaining({
          quizTtl: '내 퀴즈',
          crtUserKey: 'user-key-1',
        }),
      );
      expect(quizSongRepositoryMock.save).toHaveBeenCalledTimes(
        MIN_USER_QUIZ_SONG_COUNT,
      );
      expect(quizAnswerRepositoryMock.save).toHaveBeenCalledTimes(
        MIN_USER_QUIZ_SONG_COUNT,
      );
    });

    it('저장 값은 클라이언트가 보낸 원본이 아니라 videoId로 재구성한 URL이다', async () => {
      await service.createQuiz('user-1', {
        ...baseDto,
        songs: [
          makeSongInput('1', {
            youtubeUrl:
              'https://www.youtube.com/watch?v=hacked&t=999&extra=evil',
            youtubeVideoId: 'hacked',
          }),
          ...baseDto.songs.slice(1),
        ],
      });

      expect(quizSongRepositoryMock.save).toHaveBeenCalledWith(
        expect.objectContaining({
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
        .mockResolvedValue({ valid: true });

      await service.createQuiz('user-1', baseDto);
      await flushMicrotasks();

      expect(quizSongRepositoryMock.delete).toHaveBeenCalledTimes(1);
      expect(notificationServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining('1곡 제외'),
          message: expect.stringContaining('영상을 찾을 수 없습니다.'),
        }),
      );
    });

    it('자동 등록 링크는 안전망에서 제목 매칭을 건너뛴다', async () => {
      await service.createQuiz('user-1', {
        ...baseDto,
        songs: [
          makeSongInput('1', { linkSource: 'AUTO' }),
          ...baseDto.songs.slice(1),
        ],
      });
      await flushMicrotasks();

      expect(youtubeLinkValidationServiceMock.validate).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        { skipContentCheck: true },
      );
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
      songRepositoryMock.findBy.mockResolvedValue(
        dto.songs.map((s) => ({ songId: s.songId, songNm: `곡${s.songId}` })),
      );
      quizRepositoryMock.findOne.mockResolvedValue({
        quizId: 'quiz-1',
        crtUserKey: 'user-key-1',
      });
      quizRepositoryMock.save.mockImplementation(async (d) => d);
    });

    it('본인 소유 퀴즈가 아니면 ForbiddenException을 던진다', async () => {
      quizRepositoryMock.findOne.mockResolvedValue({
        quizId: 'quiz-1',
        crtUserKey: 'other-user',
      });

      await expect(service.updateQuiz('user-1', 'quiz-1', dto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('존재하지 않는 퀴즈면 NotFoundException을 던진다', async () => {
      quizRepositoryMock.findOne.mockResolvedValue(null);

      await expect(service.updateQuiz('user-1', 'quiz-1', dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('기존 출제곡/정답/아티스트 연결을 지우고 새로 저장한다', async () => {
      quizSongRepositoryMock.find.mockResolvedValue([
        { quizSongId: 'old-1' },
        { quizSongId: 'old-2' },
      ]);

      const result = await service.updateQuiz('user-1', 'quiz-1', dto);

      expect(quizAnswerRepositoryMock.delete).toHaveBeenCalledWith({
        quizSongId: expect.anything(),
      });
      expect(quizSongRepositoryMock.delete).toHaveBeenCalledWith({
        quizId: 'quiz-1',
      });
      expect(quizArtistRepositoryMock.delete).toHaveBeenCalledWith({
        quizId: 'quiz-1',
      });
      expect(quizSongRepositoryMock.save).toHaveBeenCalledTimes(
        MIN_USER_QUIZ_SONG_COUNT,
      );
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
