import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CacheService } from '../cache/cache.service';
import { QuizSearchType } from './dto/get-quizzes-query.dto';
import { QuizService } from './quiz.service';
import { Quiz } from './entities/quiz.entity';
import { QuizSong } from './entities/quiz-song.entity';

describe('QuizService', () => {
  let quizService: QuizService;
  let cacheService: CacheService;

  const quizListFixture = [
    {
      quizId: '1',
      quizTtl: '아이유',
      quizDesc: '아이유 - 노래 맞추기',
      thumbImgUrl: null,
      playCnt: 0,
    },
  ];

  const queryBuilderMock: {
    where: jest.Mock;
    andWhere: jest.Mock;
    leftJoin: jest.Mock;
    distinct: jest.Mock;
    orderBy: jest.Mock;
    getMany: jest.Mock;
  } = {
    where: jest.fn(),
    andWhere: jest.fn(),
    leftJoin: jest.fn(),
    distinct: jest.fn(),
    orderBy: jest.fn(),
    getMany: jest.fn(),
  };
  queryBuilderMock.where.mockReturnValue(queryBuilderMock);
  queryBuilderMock.andWhere.mockReturnValue(queryBuilderMock);
  queryBuilderMock.leftJoin.mockReturnValue(queryBuilderMock);
  queryBuilderMock.distinct.mockReturnValue(queryBuilderMock);
  queryBuilderMock.orderBy.mockReturnValue(queryBuilderMock);

  const quizRepositoryMock = {
    createQueryBuilder: jest.fn().mockReturnValue(queryBuilderMock),
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    delete process.env.REDIS_HOST;
    Object.values(queryBuilderMock).forEach((fn) => fn.mockClear());
    queryBuilderMock.where.mockReturnValue(queryBuilderMock);
    queryBuilderMock.andWhere.mockReturnValue(queryBuilderMock);
    queryBuilderMock.leftJoin.mockReturnValue(queryBuilderMock);
    queryBuilderMock.distinct.mockReturnValue(queryBuilderMock);
    queryBuilderMock.orderBy.mockReturnValue(queryBuilderMock);
    queryBuilderMock.getMany.mockResolvedValue(quizListFixture);
    quizRepositoryMock.createQueryBuilder.mockClear();

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

  it('두 번 연속 같은 조건으로 조회하면 DB는 한 번만 조회하고 캐시된 결과를 반환한다', async () => {
    const first = await quizService.getQuizzes({});
    const second = await quizService.getQuizzes({});

    expect(first).toEqual([
      {
        quizId: '1',
        quizTtl: '아이유',
        quizDesc: '아이유 - 노래 맞추기',
        thumbImgUrl: null,
        playCnt: 0,
      },
    ]);
    expect(second).toEqual(first);
    expect(quizRepositoryMock.createQueryBuilder).toHaveBeenCalledTimes(1);
  });

  it('검색 조건이 다르면 캐시를 공유하지 않고 다시 조회한다', async () => {
    await quizService.getQuizzes({ keyword: '아이유' });
    await quizService.getQuizzes({ keyword: '다른가수' });

    expect(quizRepositoryMock.createQueryBuilder).toHaveBeenCalledTimes(2);
  });

  it('searchType이 TITLE이면 퀴즈명으로만 검색하고 아티스트 조인을 하지 않는다', async () => {
    await quizService.getQuizzes({
      keyword: '아이유',
      searchType: QuizSearchType.TITLE,
    });

    expect(queryBuilderMock.leftJoin).not.toHaveBeenCalled();
    expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(
      'quiz.quizTtl LIKE :keyword',
      { keyword: '%아이유%' },
    );
  });

  it('searchType이 ARTIST이면 아티스트 조인을 통해 검색한다', async () => {
    await quizService.getQuizzes({
      keyword: '아이유',
      searchType: QuizSearchType.ARTIST,
    });

    expect(queryBuilderMock.leftJoin).toHaveBeenCalledWith(
      expect.anything(),
      'quizArtist',
      'quizArtist.quizId = quiz.quizId',
    );
    expect(queryBuilderMock.distinct).toHaveBeenCalledWith(true);
  });
});
