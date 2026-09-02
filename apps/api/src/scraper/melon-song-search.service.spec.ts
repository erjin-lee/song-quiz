import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Album } from '../quiz/entities/album.entity';
import { Artist } from '../quiz/entities/artist.entity';
import { Song } from '../quiz/entities/song.entity';
import { ArtistLinkService } from './artist-link.service';
import { MelonScraperClient } from './melon-scraper.client';
import { MelonSongSearchService } from './melon-song-search.service';

describe('MelonSongSearchService', () => {
  let service: MelonSongSearchService;

  const melonScraperClientMock = { searchSongs: jest.fn() };
  const artistRepositoryMock = {
    findOne: jest.fn(),
    create: jest.fn((d) => d),
    save: jest.fn(),
  };
  const albumRepositoryMock = {
    findOne: jest.fn(),
    create: jest.fn((d) => d),
    save: jest.fn(),
  };
  const songRepositoryMock = {
    findOne: jest.fn(),
    create: jest.fn((d) => d),
    save: jest.fn(),
  };
  const artistLinkServiceMock = {
    linkSongArtists: jest.fn(),
    linkAlbumArtists: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MelonSongSearchService,
        { provide: MelonScraperClient, useValue: melonScraperClientMock },
        { provide: getRepositoryToken(Artist), useValue: artistRepositoryMock },
        { provide: getRepositoryToken(Album), useValue: albumRepositoryMock },
        { provide: getRepositoryToken(Song), useValue: songRepositoryMock },
        { provide: ArtistLinkService, useValue: artistLinkServiceMock },
      ],
    }).compile();

    service = module.get<MelonSongSearchService>(MelonSongSearchService);
  });

  describe('search', () => {
    it('검색 결과에 "곡명 - 가수명" 라벨을 붙여 반환한다', async () => {
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
    });

    it('빈 키워드는 검색하지 않고 빈 배열을 반환한다', async () => {
      const result = await service.search('   ');

      expect(result).toEqual([]);
      expect(melonScraperClientMock.searchSongs).not.toHaveBeenCalled();
    });
  });

  describe('registerFromSearchResult', () => {
    const requestDto = {
      melonSongId: '1',
      songNm: '봄날',
      melonAlbmId: '10',
      albmNm: '앨범',
      artists: [{ melonArtistId: '100', atstNm: '방탄소년단' }],
    };

    it('이미 있는 곡이면 새로 만들지 않고 그대로 반환한다', async () => {
      const existingSong = { songId: 's1', songNm: '봄날' };
      songRepositoryMock.findOne.mockResolvedValue(existingSong);

      const result = await service.registerFromSearchResult(requestDto);

      expect(result).toBe(existingSong);
      expect(artistRepositoryMock.findOne).not.toHaveBeenCalled();
    });

    it('신규 곡이면 아티스트/앨범/곡을 전부 새로 만들고 관계를 연결한다', async () => {
      songRepositoryMock.findOne.mockResolvedValue(null);
      artistRepositoryMock.findOne.mockResolvedValue(null);
      artistRepositoryMock.save.mockResolvedValue({
        atstId: 'a1',
        melonAtstId: '100',
      });
      albumRepositoryMock.findOne.mockResolvedValue(null);
      albumRepositoryMock.save.mockResolvedValue({
        albmId: 'al1',
        melonAlbmId: '10',
      });
      songRepositoryMock.save.mockResolvedValue({
        songId: 's1',
        songNm: '봄날',
      });

      const result = await service.registerFromSearchResult(requestDto);

      expect(artistRepositoryMock.save).toHaveBeenCalledTimes(1);
      expect(albumRepositoryMock.save).toHaveBeenCalledTimes(1);
      expect(artistLinkServiceMock.linkAlbumArtists).toHaveBeenCalledWith(
        'al1',
        [{ atstId: 'a1', melonAtstId: '100' }],
      );
      expect(artistLinkServiceMock.linkSongArtists).toHaveBeenCalledWith('s1', [
        { atstId: 'a1', melonAtstId: '100' },
      ]);
      expect(result).toEqual({ songId: 's1', songNm: '봄날' });
    });

    it('이미 있는 아티스트/앨범은 재사용하고 곡만 새로 만든다', async () => {
      songRepositoryMock.findOne.mockResolvedValue(null);
      artistRepositoryMock.findOne.mockResolvedValue({
        atstId: 'a1',
        melonAtstId: '100',
      });
      albumRepositoryMock.findOne.mockResolvedValue({
        albmId: 'al1',
        melonAlbmId: '10',
      });
      songRepositoryMock.save.mockResolvedValue({
        songId: 's1',
        songNm: '봄날',
      });

      await service.registerFromSearchResult(requestDto);

      expect(artistRepositoryMock.save).not.toHaveBeenCalled();
      expect(albumRepositoryMock.save).not.toHaveBeenCalled();
      expect(artistLinkServiceMock.linkAlbumArtists).not.toHaveBeenCalled();
    });

    it('동시 등록으로 곡 저장이 unique 충돌하면 재조회한 값을 반환한다', async () => {
      songRepositoryMock.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ songId: 's1', songNm: '봄날' });
      artistRepositoryMock.findOne.mockResolvedValue({ atstId: 'a1' });
      albumRepositoryMock.findOne.mockResolvedValue({ albmId: 'al1' });
      songRepositoryMock.save.mockRejectedValue(new Error('duplicate'));

      const result = await service.registerFromSearchResult(requestDto);

      expect(result).toEqual({ songId: 's1', songNm: '봄날' });
      expect(artistLinkServiceMock.linkSongArtists).not.toHaveBeenCalled();
    });
  });
});
