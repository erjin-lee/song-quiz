import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AlbumArtist } from '../quiz/entities/album-artist.entity';
import { Artist } from '../quiz/entities/artist.entity';
import { SongArtist } from '../quiz/entities/song-artist.entity';

/**
 * 곡/앨범과 아티스트의 다대다 관계(SQ_SONG_ATST/SQ_ALBM_ATST)를 채운다.
 * artists 배열의 순서를 표시 순서(ATST_SEQ)로, 첫 번째를 대표 아티스트
 * (MAIN_YN='Y')로 취급한다. chart-scraper/scraper 양쪽에서 공용으로 쓴다.
 *
 * 기존 링크를 순서대로 하나씩 upsert하지 않고, 트랜잭션 안에서 전부
 * 삭제한 뒤 새로 넣는다 - 순서만 upsert하면 (SONG_ID,ATST_SEQ)/
 * (ALBM_ID,ATST_SEQ) 유니크 제약과 중간에 충돌할 수 있고(예: 기존 A=1,B=2를
 * B=1,A=2로 바꾸는 도중 B=1 저장 시점에 기존 A=1과 충돌), 새 응답에서 빠진
 * 아티스트가 계속 남는 문제도 있었다. 전체 삭제 후 재생성이면 두 문제 모두
 * 한 번에 해결된다.
 */
@Injectable()
export class ArtistLinkService {
  constructor(
    @InjectRepository(SongArtist)
    private readonly songArtistRepository: Repository<SongArtist>,
    @InjectRepository(AlbumArtist)
    private readonly albumArtistRepository: Repository<AlbumArtist>,
  ) {}

  async linkSongArtists(songId: string, artists: Artist[]): Promise<void> {
    await this.songArtistRepository.manager.transaction(async (manager) => {
      await manager.delete(SongArtist, { songId });
      if (artists.length === 0) {
        return;
      }
      await manager.save(
        SongArtist,
        artists.map((artist, index) =>
          manager.create(SongArtist, {
            songId,
            atstId: artist.atstId,
            atstSeq: index + 1,
            mainYn: index === 0 ? 'Y' : 'N',
          }),
        ),
      );
    });
  }

  async linkAlbumArtists(albmId: string, artists: Artist[]): Promise<void> {
    await this.albumArtistRepository.manager.transaction(async (manager) => {
      await manager.delete(AlbumArtist, { albmId });
      if (artists.length === 0) {
        return;
      }
      await manager.save(
        AlbumArtist,
        artists.map((artist, index) =>
          manager.create(AlbumArtist, {
            albmId,
            atstId: artist.atstId,
            atstSeq: index + 1,
            mainYn: index === 0 ? 'Y' : 'N',
          }),
        ),
      );
    });
  }
}
