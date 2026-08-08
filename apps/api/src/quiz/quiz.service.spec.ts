import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CacheService } from '../cache/cache.service';
import { QuizService } from './quiz.service';
import { Quiz } from './entities/quiz.entity';
import { QuizSong } from './entities/quiz-song.entity';

describe('QuizService', () => {
  let quizService: QuizService;
  let cacheService: CacheService;
  const quizRepositoryMock = {
    find: jest.fn(),
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    delete process.env.REDIS_HOST;
    quizRepositoryMock.find.mockReset();
    quizRepositoryMock.find.mockResolvedValue([
      {
        quizId: '1',
        quizTtl: '아이유',
        quizDesc: '아이유 - 노래 맞추기',
        thumbImgUrl: null,
        playCnt: 0,
      },
    ]);

    const app: TestingModule = await Test.createTestingModule({
      providers: [
        QuizService,
        CacheService,
        { provide: getRepositoryToken(Quiz), useValue: quizRepositoryMock },
        { provide: getRepositoryToken(QuizSong), useValue: {} },
      ],
    }).compile();

    quizService = app.get<QuizService>(QuizService);
    cacheService = app.get<CacheService>(CacheService);
  });

  afterEach(async () => {
    await cacheService.onModuleDestroy();
  });

  it('두 번 연속 조회해도 DB는 한 번만 조회하고 캐시된 결과를 반환한다', async () => {
    const first = await quizService.getQuizzes();
    const second = await quizService.getQuizzes();

    expect(first).toEqual(second);
    expect(quizRepositoryMock.find).toHaveBeenCalledTimes(1);
  });
});