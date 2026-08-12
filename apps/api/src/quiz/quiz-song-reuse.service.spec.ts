import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QuizAnswer } from './entities/quiz-answer.entity';
import { QuizSong } from './entities/quiz-song.entity';
import { QuizSongReuseService } from './quiz-song-reuse.service';

describe('QuizSongReuseService', () => {
  let service: QuizSongReuseService;

  const quizSongRepositoryMock = {
    find: jest.fn(),
    findOne: jest.fn(),
  };

  const quizAnswerRepositoryMock = {
    find: jest.fn(),
    create: jest.fn((data) => data),
    save: jest.fn(async (data) => data),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuizSongReuseService,
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

    service = module.get<QuizSongReuseService>(QuizSongReuseService);
  });

  describe('findReusableYoutubeInfo', () => {
    it('유튜브 정보가 채워진 다른 퀴즈 출제곡이 있으면 반환한다', async () => {
      const reusable = {
        quizSongId: 'other-1',
        youtubeUrl: 'https://youtu.be/abc',
      };
      quizSongRepositoryMock.findOne.mockResolvedValue(reusable);

      const result = await service.findReusableYoutubeInfo('song-1');

      expect(quizSongRepositoryMock.findOne).toHaveBeenCalledWith({
        where: { songId: 'song-1', youtubeUrl: expect.anything() },
        order: { updDt: 'DESC' },
      });
      expect(result).toBe(reusable);
    });

    it('재사용할 유튜브 정보가 없으면 null을 반환한다', async () => {
      quizSongRepositoryMock.findOne.mockResolvedValue(null);

      const result = await service.findReusableYoutubeInfo('song-1');

      expect(result).toBeNull();
    });
  });

  describe('copyReusableAnswers', () => {
    it('동일 곡을 출제한 다른 퀴즈 출제곡 중 가장 최근에 정답이 있는 것을 찾아 복사한다', async () => {
      quizSongRepositoryMock.find.mockResolvedValue([
        { quizSongId: 'newer-quiz-song', updDt: new Date('2024-02-01') },
        { quizSongId: 'older-quiz-song', updDt: new Date('2024-01-01') },
      ]);
      quizAnswerRepositoryMock.find.mockImplementation(
        async ({ where }: { where: { quizSongId: string } }) =>
          where.quizSongId === 'newer-quiz-song'
            ? [
                {
                  answerTxt: '노래A',
                  answerType: 'TITLE',
                  confidence: 'HIGH',
                  isActive: 'Y',
                },
              ]
            : [],
      );

      const copiedCount = await service.copyReusableAnswers(
        'song-1',
        'target-quiz-song',
      );

      expect(quizAnswerRepositoryMock.save).toHaveBeenCalledWith([
        expect.objectContaining({
          quizSongId: 'target-quiz-song',
          answerTxt: '노래A',
        }),
      ]);
      expect(copiedCount).toBe(1);
    });

    it('정답을 가진 다른 퀴즈 출제곡이 없으면 아무것도 복사하지 않는다', async () => {
      quizSongRepositoryMock.find.mockResolvedValue([
        { quizSongId: 'other-1', updDt: new Date() },
      ]);
      quizAnswerRepositoryMock.find.mockResolvedValue([]);

      const copiedCount = await service.copyReusableAnswers(
        'song-1',
        'target-quiz-song',
      );

      expect(quizAnswerRepositoryMock.save).not.toHaveBeenCalled();
      expect(copiedCount).toBe(0);
    });

    it('자기 자신(대상 퀴즈 출제곡)은 정답 복사 후보에서 제외한다', async () => {
      quizSongRepositoryMock.find.mockResolvedValue([
        { quizSongId: 'target-quiz-song', updDt: new Date() },
      ]);

      const copiedCount = await service.copyReusableAnswers(
        'song-1',
        'target-quiz-song',
      );

      expect(quizAnswerRepositoryMock.find).not.toHaveBeenCalled();
      expect(copiedCount).toBe(0);
    });
  });
});
