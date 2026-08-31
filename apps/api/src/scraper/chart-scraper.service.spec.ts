import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Album } from '../quiz/entities/album.entity';
import { Artist } from '../quiz/entities/artist.entity';
import { QuizSong } from '../quiz/entities/quiz-song.entity';
import { Quiz } from '../quiz/entities/quiz.entity';
import { Song } from '../quiz/entities/song.entity';
import { QuizSongReuseService } from '../quiz/quiz-song-reuse.service';
import { ArtistLinkService } from './artist-link.service';
import { ChartScraperService } from './chart-scraper.service';
import {
  ChartType,
  MelonScraperClient,
  ScrapedChartSong,
} from './melon-scraper.client';

describe('ChartScraperService', () => {
  let service: ChartScraperService;

  const chartSongFixture: ScrapedChartSong[] = [
    {
      melonSongId: 's1',
      songNm: 'Song A',
      melonAlbmId: 'a1',
      albmNm: 'Album A',
      albumThumbImgUrl: 'https://cdnimg.melon.co.kr/album-a.jpg',
      artists: [{ melonArtistId: 'ar1', atstNm: 'Artist1' }],
    },
    {
      melonSongId: 's2',
      songNm: 'Song B',
      melonAlbmId: 'a1',
      albmNm: 'Album A',
      albumThumbImgUrl: null,
      artists: [
        { melonArtistId: 'ar1', atstNm: 'Artist1' },
        { melonArtistId: 'ar2', atstNm: 'Artist2' },
      ],
    },
  ];

  const existingArtist2 = {
    atstId: 'existing-atst-2',
    melonAtstId: 'ar2',
    atstNm: 'Artist2',
  };
  const existingSong2 = {
    songId: 'existing-song-2',
    melonSongId: 's2',
    songNm: 'Song B',
  };

  const melonScraperClientMock = {
    fetchAgeChartSongs: jest.fn(),
    fetchArtist: jest.fn(),
  };

  const artistRepositoryMock = {
    findOne: jest.fn(),
    create: jest.fn((data) => data),
    save: jest.fn(async (data) => ({ atstId: 'new-atst-1', ...data })),
  };

  const albumRepositoryMock = {
    findOne: jest.fn(),
    create: jest.fn((data) => data),
    save: jest.fn(async (data) => ({ albmId: 'new-albm-1', ...data })),
  };

  const songRepositoryMock = {
    findOne: jest.fn(),
    create: jest.fn((data) => data),
    save: jest.fn(async (data) => ({ songId: 'new-song-1', ...data })),
  };

  const quizRepositoryMock = {
    create: jest.fn((data) => data),
    save: jest.fn(async (data) => ({ quizId: 'quiz-1', ...data })),
  };

  let quizSongSeq = 0;
  const quizSongRepositoryMock = {
    create: jest.fn((data) => data),
    save: jest.fn(async (data) => ({
      quizSongId: `quiz-song-${++quizSongSeq}`,
      ...data,
    })),
  };

  const quizSongReuseServiceMock = {
    findReusableYoutubeInfo: jest.fn(),
    copyReusableAnswers: jest.fn(),
  };

  const artistLinkServiceMock = {
    linkAlbumArtists: jest.fn(),
    linkSongArtists: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    quizSongSeq = 0;
    quizSongReuseServiceMock.findReusableYoutubeInfo.mockResolvedValue(null);
    quizSongReuseServiceMock.copyReusableAnswers.mockResolvedValue(0);

    melonScraperClientMock.fetchAgeChartSongs.mockResolvedValue(
      chartSongFixture,
    );
    melonScraperClientMock.fetchArtist.mockResolvedValue({
      melonArtistId: 'ar1',
      atstNm: 'Artist1(fetched)',
      thumbImgUrl: 'https://cdnimg.melon.co.kr/album-a.jpg',
    });
    artistRepositoryMock.findOne.mockImplementation(
      async ({ where: { melonAtstId } }) =>
        melonAtstId === 'ar2' ? existingArtist2 : null,
    );
    albumRepositoryMock.findOne.mockResolvedValue(null);
    songRepositoryMock.findOne.mockImplementation(
      async ({ where: { melonSongId } }) =>
        melonSongId === 's2' ? existingSong2 : null,
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChartScraperService,
        { provide: MelonScraperClient, useValue: melonScraperClientMock },
        { provide: getRepositoryToken(Artist), useValue: artistRepositoryMock },
        { provide: getRepositoryToken(Album), useValue: albumRepositoryMock },
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
        {
          provide: ArtistLinkService,
          useValue: artistLinkServiceMock,
        },
      ],
    }).compile();

    service = module.get<ChartScraperService>(ChartScraperService);
  });

  it('10년 단위가 아닌 연대는 AG 타입 요청 전에 거부한다', async () => {
    await expect(service.scrapeChart(ChartType.AG, 2015)).rejects.toThrow(
      BadRequestException,
    );
    expect(melonScraperClientMock.fetchAgeChartSongs).not.toHaveBeenCalled();
  });

  it('유효하지 않은 연도는 YE 타입 요청 전에 거부한다', async () => {
    await expect(service.scrapeChart(ChartType.YE, 0)).rejects.toThrow(
      BadRequestException,
    );
    expect(melonScraperClientMock.fetchAgeChartSongs).not.toHaveBeenCalled();
  });

  it('YE 타입은 10년 단위가 아닌 임의의 연도도 허용한다', async () => {
    await expect(
      service.scrapeChart(ChartType.YE, 2023),
    ).resolves.toMatchObject({ type: ChartType.YE, year: 2023 });
    expect(melonScraperClientMock.fetchAgeChartSongs).toHaveBeenCalledWith(
      '2023',
      ChartType.YE,
    );
  });

  it('차트 결과가 없으면 404를 반환한다', async () => {
    melonScraperClientMock.fetchAgeChartSongs.mockResolvedValueOnce([]);

    await expect(service.scrapeChart(ChartType.AG, 2010)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('신규 아티스트는 멜론에서 스크래핑해 저장하고, 이미 저장된 아티스트는 재조회 없이 재사용한다', async () => {
    await service.scrapeChart(ChartType.AG, 2010);

    expect(melonScraperClientMock.fetchArtist).toHaveBeenCalledTimes(1);
    expect(melonScraperClientMock.fetchArtist).toHaveBeenCalledWith('ar1');
    expect(artistRepositoryMock.save).toHaveBeenCalledTimes(1);
  });

  it('멜론 곡 ID가 이미 존재하면 곡 저장은 건너뛰고 퀴즈 출제곡에는 포함한다', async () => {
    const result = await service.scrapeChart(ChartType.AG, 2010);

    expect(songRepositoryMock.save).toHaveBeenCalledTimes(1);
    expect(quizSongRepositoryMock.save).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      chartSongCount: 2,
      savedArtistCount: 1,
      savedSongCount: 1,
      skippedSongCount: 1,
      savedQuizSongCount: 2,
    });
  });

  it('퀴즈 제목/설명을 연대 규칙대로 생성하고, 퀴즈 출제곡을 빈 유튜브 정보로 순번대로 저장한다', async () => {
    await service.scrapeChart(ChartType.AG, 2010);

    expect(quizRepositoryMock.create).toHaveBeenCalledWith({
      quizTtl: '2010년대 인기곡',
      quizDesc: '2010 ~ 2020 멜론 인기 차트 곡 입니다.',
      thumbImgUrl: 'https://cdnimg.melon.co.kr/album-a.jpg',
    });
    expect(quizSongRepositoryMock.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        quizSeq: 1,
        youtubeUrl: '',
        songId: 'new-song-1',
      }),
    );
    expect(quizSongRepositoryMock.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        quizSeq: 2,
        youtubeUrl: '',
        songId: 'existing-song-2',
      }),
    );
  });

  it('퀴즈 제목/설명을 연도 규칙대로 생성한다', async () => {
    await service.scrapeChart(ChartType.YE, 2023);

    expect(quizRepositoryMock.create).toHaveBeenCalledWith({
      quizTtl: '2023년 인기곡',
      quizDesc: '2023 멜론 인기 차트 곡 입니다.',
      thumbImgUrl: 'https://cdnimg.melon.co.kr/album-a.jpg',
    });
  });

  it('동일 곡을 다른 퀴즈에서 이미 출제해 유튜브 정보가 있으면 재사용한다', async () => {
    quizSongReuseServiceMock.findReusableYoutubeInfo.mockImplementation(
      async (songId: string) =>
        songId === 'new-song-1'
          ? {
              quizSongId: 'other-quiz-song-1',
              youtubeUrl: 'https://youtu.be/abc',
              youtubeVideoId: 'abc',
              durationSec: 240,
              startSec: 12,
              endSec: 30,
            }
          : null,
    );

    const result = await service.scrapeChart(ChartType.AG, 2010);

    expect(quizSongRepositoryMock.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        songId: 'new-song-1',
        youtubeUrl: 'https://youtu.be/abc',
        youtubeVideoId: 'abc',
        durationSec: 240,
        startSec: 12,
        endSec: 30,
      }),
    );
    expect(result.reusedYoutubeCount).toBe(1);
  });

  it('동일 곡을 출제한 다른 퀴즈 출제곡에 정답이 있으면 새 출제곡에 복사한다', async () => {
    quizSongReuseServiceMock.copyReusableAnswers.mockImplementation(
      async (songId: string) => (songId === 'new-song-1' ? 2 : 0),
    );

    const result = await service.scrapeChart(ChartType.AG, 2010);

    expect(quizSongReuseServiceMock.copyReusableAnswers).toHaveBeenCalledWith(
      'new-song-1',
      'quiz-song-1',
    );
    expect(result.reusedAnswerCount).toBe(2);
  });

  it('곡의 아티스트 전원을 SongArtist/AlbumArtist로 연결하고, 첫 번째 아티스트를 대표로 넘긴다', async () => {
    await service.scrapeChart(ChartType.AG, 2010);

    expect(artistLinkServiceMock.linkSongArtists).toHaveBeenNthCalledWith(
      1,
      'new-song-1',
      [expect.objectContaining({ melonAtstId: 'ar1' })],
    );
    expect(artistLinkServiceMock.linkSongArtists).toHaveBeenNthCalledWith(
      2,
      'existing-song-2',
      [
        expect.objectContaining({ melonAtstId: 'ar1' }),
        expect.objectContaining(existingArtist2),
      ],
    );
    expect(artistLinkServiceMock.linkAlbumArtists).toHaveBeenNthCalledWith(
      2,
      'new-albm-1',
      [
        expect.objectContaining({ melonAtstId: 'ar1' }),
        expect.objectContaining(existingArtist2),
      ],
    );
  });

  it('아티스트 목록이 빈 곡은 예외 없이 건너뛰고, 이미 존재해 건너뛴 곡과 별도로 집계한다', async () => {
    melonScraperClientMock.fetchAgeChartSongs.mockResolvedValueOnce([
      { ...chartSongFixture[0], artists: [] },
      chartSongFixture[1],
    ]);

    const result = await service.scrapeChart(ChartType.AG, 2010);

    expect(songRepositoryMock.save).not.toHaveBeenCalled();
    expect(quizSongRepositoryMock.save).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      skippedInvalidSongCount: 1,
      skippedSongCount: 1,
      savedQuizSongCount: 1,
    });
  });
});
