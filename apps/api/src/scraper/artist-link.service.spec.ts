import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AlbumArtist } from '../quiz/entities/album-artist.entity';
import { Artist } from '../quiz/entities/artist.entity';
import { SongArtist } from '../quiz/entities/song-artist.entity';
import { ArtistLinkService } from './artist-link.service';

describe('ArtistLinkService', () => {
  let service: ArtistLinkService;

  const songArtistRepositoryMock = {
    findOne: jest.fn(),
    create: jest.fn((data) => data),
    save: jest.fn(async (data) => data),
  };

  const albumArtistRepositoryMock = {
    findOne: jest.fn(),
    create: jest.fn((data) => data),
    save: jest.fn(async (data) => data),
  };

  const artist1: Artist = { atstId: 'atst-1' } as Artist;
  const artist2: Artist = { atstId: 'atst-2' } as Artist;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ArtistLinkService,
        {
          provide: getRepositoryToken(SongArtist),
          useValue: songArtistRepositoryMock,
        },
        {
          provide: getRepositoryToken(AlbumArtist),
          useValue: albumArtistRepositoryMock,
        },
      ],
    }).compile();

    service = module.get<ArtistLinkService>(ArtistLinkService);
  });

  it('신규 곡-아티스트 링크는 순서대로 ATST_SEQ를 매기고 첫 번째만 MAIN_YN=Y로 생성한다', async () => {
    songArtistRepositoryMock.findOne.mockResolvedValue(null);

    await service.linkSongArtists('song-1', [artist1, artist2]);

    expect(songArtistRepositoryMock.save).toHaveBeenNthCalledWith(1, {
      songId: 'song-1',
      atstId: 'atst-1',
      atstSeq: 1,
      mainYn: 'Y',
    });
    expect(songArtistRepositoryMock.save).toHaveBeenNthCalledWith(2, {
      songId: 'song-1',
      atstId: 'atst-2',
      atstSeq: 2,
      mainYn: 'N',
    });
  });

  it('이미 링크된 곡-아티스트는 새로 만들지 않고 순번/대표 여부만 갱신한다', async () => {
    const existing = {
      songId: 'song-1',
      atstId: 'atst-1',
      atstSeq: 5,
      mainYn: 'N',
    };
    songArtistRepositoryMock.findOne.mockResolvedValueOnce(existing);

    await service.linkSongArtists('song-1', [artist1]);

    expect(songArtistRepositoryMock.create).not.toHaveBeenCalled();
    expect(songArtistRepositoryMock.save).toHaveBeenCalledWith({
      songId: 'song-1',
      atstId: 'atst-1',
      atstSeq: 1,
      mainYn: 'Y',
    });
  });

  it('앨범-아티스트도 동일한 규칙(순서=ATST_SEQ, 첫 번째=MAIN_YN=Y)으로 연결한다', async () => {
    albumArtistRepositoryMock.findOne.mockResolvedValue(null);

    await service.linkAlbumArtists('albm-1', [artist1, artist2]);

    expect(albumArtistRepositoryMock.save).toHaveBeenNthCalledWith(1, {
      albmId: 'albm-1',
      atstId: 'atst-1',
      atstSeq: 1,
      mainYn: 'Y',
    });
    expect(albumArtistRepositoryMock.save).toHaveBeenNthCalledWith(2, {
      albmId: 'albm-1',
      atstId: 'atst-2',
      atstSeq: 2,
      mainYn: 'N',
    });
  });
});
