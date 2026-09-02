import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CacheService } from '../cache/cache.service';
import { Album } from '../quiz/entities/album.entity';
import { Artist } from '../quiz/entities/artist.entity';
import { Song } from '../quiz/entities/song.entity';
import { ArtistLinkService } from './artist-link.service';
import { MelonScraperClient } from './melon-scraper.client';
import { MelonSongSearchService } from './melon-song-search.service';

describe('MelonSongSearchService', () => {
  let service: MelonSongSearchService;

  const melonScraperClientMock = { searchSongs: jest.fn() };
  const cacheServiceMock = { get: jest.fn(), set: jest.fn() };

  const managerMock: Record<string, jest.Mock> = {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn((_entity, data) => data),
  };
  managerMock.transaction = jest.fn(async (cb: (m: unknown) => unknown) =>
    cb(managerMock),
  );

  const songRepositoryMock = {
    findOne: jest.fn(),
    manager: managerMock,
  };
  const artistLinkServiceMock = {
    linkSongArtists: jest.fn(),
    linkAlbumArtists: jest.fn(),
  };

  const cachedSearchResult = {
    melonSongId: '1',
    songNm: '봄날',
    melonAlbmId: '10',
    albmNm: '앨범',
    artists: [{ melonArtistId: '100', atstNm: '방탄소년단' }],
    displayLabel: '봄날 - 방탄소년단',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MelonSongSearchService,
        { provide: MelonScraperClient, useValue: melonScraperClientMock },
        { provide: CacheService, useValue: cacheServiceMock },
        { provide: getRepositoryToken(Song), useValue: songRepositoryMock },
        { provide: ArtistLinkService, useValue: artistLinkServiceMock },
      ],
    }).compile();

    service = module.get<MelonSongSearchService>(MelonSongSearchService);
  });

  describe('search', () => {
    it('검색 결과에 "곡명 - 가수명" 라벨을 붙여 반환하고 melonSongId별로 캐시해둔다', async () => {
      melonScraperClientMock.searchSongs.mockResolvedValue([
        {
          melonSongId: '1',
          songNm: '봄날',
          melonAlbmId: '10',
          albmNm: '앨범',
          artists: [{ melonArtistId: '100', atstNm: '방탄소년단' }],
        },
      ]);

      const result = await service.search('봄날');

      expect(result[0].displayLabel).toBe('봄날 - 방탄소년단');
      expect(cacheServiceMock.set).toHaveBeenCalledWith(
        expect.stringContaining('1'),
        expect.objectContaining({ melonSongId: '1' }),
        expect.any(Number),
      );
    });

    it('빈 키워드는 검색하지 않고 빈 배열을 반환한다', async () => {
      const result = await service.search('   ');

      expect(result).toEqual([]);
      expect(melonScraperClientMock.searchSongs).not.toHaveBeenCalled();
    });
  });

  describe('registerFromMelonSongId', () => {
    it('이미 있는 곡이면 새로 만들지 않고 그대로 반환한다', async () => {
      const existingSong = { songId: 's1', songNm: '봄날' };
      songRepositoryMock.findOne.mockResolvedValue(existingSong);

      const result = await service.registerFromMelonSongId('1');

      expect(result).toBe(existingSong);
      expect(cacheServiceMock.get).not.toHaveBeenCalled();
    });

    it('캐시된 검색 결과가 없으면 재검색을 요청한다', async () => {
      songRepositoryMock.findOne.mockResolvedValue(null);
      cacheServiceMock.get.mockResolvedValue(undefined);

      await expect(service.registerFromMelonSongId('1')).rejects.toThrow(
        BadRequestException,
      );
      expect(managerMock.transaction).not.toHaveBeenCalled();
    });

    it('클라이언트가 곡명/아티스트명을 별도로 보내도 무시하고 캐시된 검색 결과만 신뢰한다', async () => {
      songRepositoryMock.findOne.mockResolvedValue(null);
      cacheServiceMock.get.mockResolvedValue(cachedSearchResult);
      managerMock.findOne.mockResolvedValue(null); // 아티스트/앨범 신규
      managerMock.save.mockImplementation((entity: unknown, data: unknown) => {
        if (entity === Artist)
          return Promise.resolve({ atstId: 'a1', ...(data as object) });
        if (entity === Album)
          return Promise.resolve({ albmId: 'al1', ...(data as object) });
        if (entity === Song)
          return Promise.resolve({ songId: 's1', ...(data as object) });
        return Promise.resolve(data);
      });

      const result = await service.registerFromMelonSongId('1');

      expect(managerMock.save).toHaveBeenCalledWith(
        Song,
        expect.objectContaining({ melonSongId: '1', songNm: '봄날' }),
      );
      expect(result).toEqual(
        expect.objectContaining({ songId: 's1', songNm: '봄날' }),
      );
    });

    it('신규 곡이면 아티스트/앨범/곡을 전부 새로 만들고 관계를 연결한다', async () => {
      songRepositoryMock.findOne.mockResolvedValue(null);
      cacheServiceMock.get.mockResolvedValue(cachedSearchResult);
      managerMock.findOne.mockResolvedValue(null);
      managerMock.save.mockImplementation((entity: unknown, data: unknown) => {
        if (entity === Artist)
          return Promise.resolve({ atstId: 'a1', ...(data as object) });
        if (entity === Album)
          return Promise.resolve({ albmId: 'al1', ...(data as object) });
        if (entity === Song)
          return Promise.resolve({ songId: 's1', ...(data as object) });
        return Promise.resolve(data);
      });

      await service.registerFromMelonSongId('1');

      expect(managerMock.save).toHaveBeenCalledWith(
        Artist,
        expect.objectContaining({ melonAtstId: '100' }),
      );
      expect(artistLinkServiceMock.linkAlbumArtists).toHaveBeenCalledWith(
        'al1',
        [expect.objectContaining({ atstId: 'a1' })],
        managerMock,
      );
      expect(artistLinkServiceMock.linkSongArtists).toHaveBeenCalledWith(
        's1',
        [expect.objectContaining({ atstId: 'a1' })],
        managerMock,
      );
    });

    it('이미 있는 아티스트/앨범은 재사용하고 곡만 새로 만든다', async () => {
      songRepositoryMock.findOne.mockResolvedValue(null);
      cacheServiceMock.get.mockResolvedValue(cachedSearchResult);
      managerMock.findOne.mockImplementation((entity: unknown) => {
        if (entity === Artist) return Promise.resolve({ atstId: 'a1' });
        if (entity === Album) return Promise.resolve({ albmId: 'al1' });
        return Promise.resolve(null);
      });
      managerMock.save.mockImplementation((entity: unknown, data: unknown) => {
        if (entity === Song)
          return Promise.resolve({ songId: 's1', ...(data as object) });
        return Promise.resolve(data);
      });

      await service.registerFromMelonSongId('1');

      expect(managerMock.save).not.toHaveBeenCalledWith(
        Artist,
        expect.anything(),
      );
      expect(managerMock.save).not.toHaveBeenCalledWith(
        Album,
        expect.anything(),
      );
      expect(artistLinkServiceMock.linkAlbumArtists).not.toHaveBeenCalled();
    });

    it('연결 저장(linkSongArtists)이 실패하면 성공으로 위장하지 않고 에러를 전파한다', async () => {
      songRepositoryMock.findOne.mockResolvedValue(null);
      cacheServiceMock.get.mockResolvedValue(cachedSearchResult);
      managerMock.findOne.mockResolvedValue(null);
      managerMock.save.mockImplementation((entity: unknown, data: unknown) => {
        if (entity === Artist)
          return Promise.resolve({ atstId: 'a1', ...(data as object) });
        if (entity === Album)
          return Promise.resolve({ albmId: 'al1', ...(data as object) });
        if (entity === Song)
          return Promise.resolve({ songId: 's1', ...(data as object) });
        return Promise.resolve(data);
      });
      artistLinkServiceMock.linkSongArtists.mockRejectedValue(
        new Error('연결 저장 실패'),
      );

      await expect(service.registerFromMelonSongId('1')).rejects.toThrow(
        '연결 저장 실패',
      );
    });

    it('동시 등록으로 곡 저장이 unique 충돌하면 재조회한 값을 반환한다', async () => {
      songRepositoryMock.findOne.mockResolvedValue(null);
      cacheServiceMock.get.mockResolvedValue(cachedSearchResult);
      managerMock.findOne
        .mockResolvedValueOnce({ atstId: 'a1' }) // artist lookup
        .mockResolvedValueOnce({ albmId: 'al1' }) // album lookup
        .mockResolvedValueOnce({ songId: 's1', songNm: '봄날' }); // song retry lookup
      managerMock.save.mockImplementation((entity: unknown) => {
        if (entity === Song) return Promise.reject(new Error('duplicate'));
        return Promise.resolve({});
      });

      const result = await service.registerFromMelonSongId('1');

      expect(result).toEqual({ songId: 's1', songNm: '봄날' });
      expect(artistLinkServiceMock.linkSongArtists).not.toHaveBeenCalled();
    });
  });
});
