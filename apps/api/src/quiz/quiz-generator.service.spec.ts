import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Artist } from './entities/artist.entity';
import { QuizSong } from './entities/quiz-song.entity';
import { Quiz } from './entities/quiz.entity';
import { Song } from './entities/song.entity';
import { QuizGeneratorService } from './quiz-generator.service';
import { QuizSongReuseService } from './quiz-song-reuse.service';
import { YoutubeScraperClient } from './youtube-scraper.client';

describe('QuizGeneratorService.fillYoutubeLinks', () => {
  let service: QuizGeneratorService;

  const quizSongFixture = [
    {
      quizSongId: 'qs1',
      quizId: '1',
      songId: 's1',
      quizSeq: 1,
      youtubeUrl: '',
      youtubeVideoId: null,
      startSec: 0,
      endSec: null,
      song: {
        songId: 's1',
        songNm: 'Song A',
        ytbLink: null,
        artist: { atstNm: 'Artist1' },
      },
    },
    {
      quizSongId: 'qs2',
      quizId: '1',
      songId: 's2',
      quizSeq: 2,
      youtubeUrl: '',
      youtubeVideoId: null,
      startSec: 0,
      endSec: null,
      song: {
        songId: 's2',
        songNm: 'Song B',
        ytbLink: null,
        artist: { atstNm: 'Artist2' },
      },
    },
  ];

  const queryBuilderMock: {
    innerJoinAndSelect: jest.Mock;
    where: jest.Mock;
    andWhere: jest.Mock;
    orderBy: jest.Mock;
    getMany: jest.Mock;
  } = {
    innerJoinAndSelect: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    orderBy: jest.fn(),
    getMany: jest.fn(),
  };

  const quizRepositoryMock = {
    findOne: jest.fn(),
  };
  const quizSongRepositoryMock = {
    createQueryBuilder: jest.fn().mockReturnValue(queryBuilderMock),
    save: jest.fn(async (data: unknown) => data),
  };
  const songRepositoryMock = {
    save: jest.fn(async (data: unknown) => data),
  };
  const youtubeScraperClientMock = {
    search: jest.fn(),
  };
  const quizSongReuseServiceMock = {
    findReusableYoutubeInfo: jest.fn(),
    copyReusableAnswers: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    quizSongReuseServiceMock.findReusableYoutubeInfo.mockResolvedValue(null);
    quizSongReuseServiceMock.copyReusableAnswers.mockResolvedValue(0);
    queryBuilderMock.innerJoinAndSelect.mockReturnValue(queryBuilderMock);
    queryBuilderMock.where.mockReturnValue(queryBuilderMock);
    queryBuilderMock.andWhere.mockReturnValue(queryBuilderMock);
    queryBuilderMock.orderBy.mockReturnValue(queryBuilderMock);
    queryBuilderMock.getMany.mockResolvedValue(
      quizSongFixture.map((quizSong) => ({
        ...quizSong,
        song: { ...quizSong.song, artist: { ...quizSong.song.artist } },
      })),
    );
    quizSongRepositoryMock.createQueryBuilder.mockReturnValue(queryBuilderMock);
    quizRepositoryMock.findOne.mockResolvedValue({
      quizId: '1',
      quizTtl: 'Test Quiz',
    });
    youtubeScraperClientMock.search.mockImplementation(async (query: string) =>
      query.includes('Song A') ? { videoId: 'vid-a', durationSec: 200 } : null,
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuizGeneratorService,
        { provide: YoutubeScraperClient, useValue: youtubeScraperClientMock },
        { provide: getRepositoryToken(Artist), useValue: {} },
        { provide: getRepositoryToken(Song), useValue: songRepositoryMock },
        { provide: getRepositoryToken(Quiz), useValue: quizRepositoryMock },
        {
          provide: getRepositoryToken(QuizSong),
          useValue: quizSongRepositoryMock,
        },
        {
          provide: QuizSongReuseService,
          useValue: quizSongReuseServiceMock,
        },
      ],
    }).compile();

    service = module.get<QuizGeneratorService>(QuizGeneratorService);
  });

  it('퀴즈를 찾을 수 없으면 404를 반환한다', async () => {
    quizRepositoryMock.findOne.mockResolvedValueOnce(null);

    await expect(service.fillYoutubeLinks('999')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('유튜브 링크가 없는 출제곡이 없으면 400을 반환한다', async () => {
    queryBuilderMock.getMany.mockResolvedValueOnce([]);

    await expect(service.fillYoutubeLinks('1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('유튜브 링크가 빈 출제곡만 조회해, 찾은 곡은 채우고 못 찾은 곡은 건너뛴다', async () => {
    const result = await service.fillYoutubeLinks('1');

    expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(
      'quizSong.youtubeUrl = :emptyUrl',
      { emptyUrl: '' },
    );
    expect(quizSongRepositoryMock.save).toHaveBeenCalledTimes(1);
    expect(quizSongRepositoryMock.save).toHaveBeenCalledWith(
      expect.objectContaining({
        quizSongId: 'qs1',
        youtubeUrl: expect.stringContaining('vid-a'),
        youtubeVideoId: 'vid-a',
        durationSec: 200,
      }),
    );
    expect(songRepositoryMock.save).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      quizId: '1',
      quizTtl: 'Test Quiz',
      targetSongCount: 2,
      savedSongCount: 1,
      skippedSongCount: 1,
    });
  });

  it('곡의 기존 유튜브 링크가 이미 있으면 곡 정보는 덮어쓰지 않는다', async () => {
    queryBuilderMock.getMany.mockResolvedValueOnce([
      {
        ...quizSongFixture[0],
        song: {
          ...quizSongFixture[0].song,
          ytbLink: 'https://www.youtube.com/watch?v=existing',
          artist: { ...quizSongFixture[0].song.artist },
        },
      },
    ]);

    await service.fillYoutubeLinks('1');

    expect(songRepositoryMock.save).not.toHaveBeenCalled();
  });

  it('동일 곡을 다른 퀴즈에서 이미 출제해 유튜브 정보가 있으면 유튜브 검색 없이 재사용하고, 정답도 함께 복사한다', async () => {
    quizSongReuseServiceMock.findReusableYoutubeInfo.mockImplementation(
      async (songId: string) =>
        songId === 's1'
          ? {
              youtubeUrl: 'https://www.youtube.com/watch?v=reused',
              youtubeVideoId: 'reused',
              durationSec: 180,
              startSec: 10,
              endSec: 40,
            }
          : null,
    );
    quizSongReuseServiceMock.copyReusableAnswers.mockImplementation(
      async (songId: string) => (songId === 's1' ? 3 : 0),
    );

    const result = await service.fillYoutubeLinks('1');

    expect(youtubeScraperClientMock.search).not.toHaveBeenCalledWith(
      expect.stringContaining('Song A'),
    );
    expect(quizSongRepositoryMock.save).toHaveBeenCalledWith(
      expect.objectContaining({
        quizSongId: 'qs1',
        youtubeUrl: 'https://www.youtube.com/watch?v=reused',
        youtubeVideoId: 'reused',
        durationSec: 180,
      }),
    );
    expect(quizSongReuseServiceMock.copyReusableAnswers).toHaveBeenCalledWith(
      's1',
      'qs1',
    );
    expect(result).toMatchObject({
      targetSongCount: 2,
      reusedYoutubeCount: 1,
      reusedAnswerCount: 3,
      savedSongCount: 0,
      skippedSongCount: 1,
    });
  });
});
