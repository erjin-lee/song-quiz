import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Album } from '../quiz/entities/album.entity';
import { Artist } from '../quiz/entities/artist.entity';
import { Song } from '../quiz/entities/song.entity';
import { ArtistLinkService } from './artist-link.service';
import {
  MelonScraperClient,
  ScrapedAlbum,
  ScrapedSong,
} from './melon-scraper.client';
import { ScraperService } from './scraper.service';

describe('ScraperService', () => {
  let service: ScraperService;

  const albumFixtures: ScrapedAlbum[] = [
    {
      melonAlbmId: 'al1',
      albmNm: 'Solo Album',
      thumbImgUrl: null,
      rlsDt: null,
      artistIds: ['ar1'],
    },
    {
      melonAlbmId: 'al2',
      albmNm: 'Collab Album',
      thumbImgUrl: null,
      rlsDt: null,
      artistIds: ['ar1', 'ar2'],
    },
  ];

  const songFixtures: ScrapedSong[] = [
    {
      melonSongId: 's1',
      songNm: 'Solo Song',
      titleYn: 'Y',
      melonAlbmId: 'al1',
    },
    {
      melonSongId: 's2',
      songNm: 'Collab Song',
      titleYn: 'N',
      melonAlbmId: 'al2',
    },
  ];

  const melonScraperClientMock = {
    fetchArtist: jest.fn(),
    fetchAlbums: jest.fn(),
    fetchSongs: jest.fn(),
  };

  const artistRepositoryMock = {
    findOne: jest.fn(),
    create: jest.fn((data) => data),
    save: jest.fn(async (data) => ({
      atstId: `atst-${data.melonAtstId}`,
      ...data,
    })),
  };

  const albumRepositoryMock = {
    findOne: jest.fn(),
    create: jest.fn((data) => data),
    save: jest.fn(async (data) => ({
      albmId: `albm-${data.melonAlbmId}`,
      ...data,
    })),
  };

  const songRepositoryMock = {
    findOne: jest.fn(),
    create: jest.fn((data) => data),
    save: jest.fn(async (data) => ({
      songId: `song-${data.melonSongId}`,
      ...data,
    })),
  };

  const artistLinkServiceMock = {
    linkAlbumArtists: jest.fn(),
    linkSongArtists: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    melonScraperClientMock.fetchArtist.mockImplementation(
      async (melonArtistId: string) => ({
        melonArtistId,
        atstNm: `Artist ${melonArtistId}`,
        thumbImgUrl: null,
      }),
    );
    melonScraperClientMock.fetchAlbums.mockResolvedValue(albumFixtures);
    melonScraperClientMock.fetchSongs.mockResolvedValue(songFixtures);
    artistRepositoryMock.findOne.mockResolvedValue(null);
    albumRepositoryMock.findOne.mockResolvedValue(null);
    songRepositoryMock.findOne.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScraperService,
        { provide: MelonScraperClient, useValue: melonScraperClientMock },
        { provide: getRepositoryToken(Artist), useValue: artistRepositoryMock },
        { provide: getRepositoryToken(Album), useValue: albumRepositoryMock },
        { provide: getRepositoryToken(Song), useValue: songRepositoryMock },
        { provide: ArtistLinkService, useValue: artistLinkServiceMock },
      ],
    }).compile();

    service = module.get<ScraperService>(ScraperService);
  });

  it('요청받은 아티스트를 찾을 수 없으면 404를 반환한다', async () => {
    melonScraperClientMock.fetchArtist.mockResolvedValueOnce(null);

    await expect(service.scrapeArtist('ar1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('더 이상 다중 아티스트 앨범을 건너뛰지 않고, 그 앨범이 표기하는 첫 번째 아티스트를 소유자로 저장한다', async () => {
    const result = await service.scrapeArtist('ar1');

    expect(result.savedAlbumCount).toBe(2);
    expect(result.skippedAlbumCount).toBe(0);
    expect(albumRepositoryMock.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ atstId: 'atst-ar1', melonAlbmId: 'al1' }),
    );
    expect(albumRepositoryMock.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ atstId: 'atst-ar1', melonAlbmId: 'al2' }),
    );
  });

  it('요청받지 않은 협업 아티스트도 조회/생성하고, 같은 아티스트는 한 번만 조회한다', async () => {
    await service.scrapeArtist('ar1');

    expect(melonScraperClientMock.fetchArtist).toHaveBeenCalledWith('ar1');
    expect(melonScraperClientMock.fetchArtist).toHaveBeenCalledWith('ar2');
    expect(melonScraperClientMock.fetchArtist).toHaveBeenCalledTimes(2);
  });

  it('앨범/곡의 아티스트 전원을 AlbumArtist/SongArtist로 연결한다', async () => {
    await service.scrapeArtist('ar1');

    expect(artistLinkServiceMock.linkAlbumArtists).toHaveBeenNthCalledWith(
      1,
      'albm-al1',
      [expect.objectContaining({ melonAtstId: 'ar1' })],
    );
    expect(artistLinkServiceMock.linkAlbumArtists).toHaveBeenNthCalledWith(
      2,
      'albm-al2',
      [
        expect.objectContaining({ melonAtstId: 'ar1' }),
        expect.objectContaining({ melonAtstId: 'ar2' }),
      ],
    );
    expect(artistLinkServiceMock.linkSongArtists).toHaveBeenNthCalledWith(
      1,
      'song-s1',
      [expect.objectContaining({ melonAtstId: 'ar1' })],
    );
    expect(artistLinkServiceMock.linkSongArtists).toHaveBeenNthCalledWith(
      2,
      'song-s2',
      [
        expect.objectContaining({ melonAtstId: 'ar1' }),
        expect.objectContaining({ melonAtstId: 'ar2' }),
      ],
    );
  });

  it('앨범 정보가 없는 곡은 건너뛴다', async () => {
    melonScraperClientMock.fetchSongs.mockResolvedValueOnce([
      { melonSongId: 's3', songNm: 'Orphan', titleYn: 'N', melonAlbmId: null },
    ]);

    const result = await service.scrapeArtist('ar1');

    expect(result.savedSongCount).toBe(0);
    expect(result.skippedSongCount).toBe(1);
  });
});
