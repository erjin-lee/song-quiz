import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AlbumArtist } from '../quiz/entities/album-artist.entity';
import { Artist } from '../quiz/entities/artist.entity';
import { SongArtist } from '../quiz/entities/song-artist.entity';
import { ArtistLinkService } from './artist-link.service';

describe('ArtistLinkService', () => {
  let service: ArtistLinkService;

  const transactionManagerMock = {
    delete: jest.fn(),
    create: jest.fn((_entity, data) => data),
    save: jest.fn(async (_entity, data) => data),
  };

  const songArtistRepositoryMock = {
    manager: {
      transaction: jest.fn(async (cb: (manager: unknown) => unknown) =>
        cb(transactionManagerMock),
      ),
    },
  };

  const albumArtistRepositoryMock = {
    manager: {
      transaction: jest.fn(async (cb: (manager: unknown) => unknown) =>
        cb(transactionManagerMock),
      ),
    },
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

  it('곡-아티스트 링크는 기존 것을 전부 지우고 순서대로 다시 만든다(순번 충돌 방지)', async () => {
    await service.linkSongArtists('song-1', [artist1, artist2]);

    expect(transactionManagerMock.delete).toHaveBeenCalledWith(SongArtist, {
      songId: 'song-1',
    });
    expect(transactionManagerMock.save).toHaveBeenCalledWith(SongArtist, [
      { songId: 'song-1', atstId: 'atst-1', atstSeq: 1, mainYn: 'Y' },
      { songId: 'song-1', atstId: 'atst-2', atstSeq: 2, mainYn: 'N' },
    ]);
  });

  it('새 아티스트 목록이 비어 있으면 삭제만 하고 새로 만들지 않는다', async () => {
    await service.linkSongArtists('song-1', []);

    expect(transactionManagerMock.delete).toHaveBeenCalledWith(SongArtist, {
      songId: 'song-1',
    });
    expect(transactionManagerMock.save).not.toHaveBeenCalled();
  });

  it('앨범-아티스트도 동일하게 전체 삭제 후 재생성한다', async () => {
    await service.linkAlbumArtists('albm-1', [artist1, artist2]);

    expect(transactionManagerMock.delete).toHaveBeenCalledWith(AlbumArtist, {
      albmId: 'albm-1',
    });
    expect(transactionManagerMock.save).toHaveBeenCalledWith(AlbumArtist, [
      { albmId: 'albm-1', atstId: 'atst-1', atstSeq: 1, mainYn: 'Y' },
      { albmId: 'albm-1', atstId: 'atst-2', atstSeq: 2, mainYn: 'N' },
    ]);
  });
});
