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
    for (const [index, artist] of artists.entries()) {
      const atstSeq = index + 1;
      const mainYn = index === 0 ? 'Y' : 'N';
      const existing = await this.songArtistRepository.findOne({
        where: { songId, atstId: artist.atstId },
      });
      if (existing) {
        existing.atstSeq = atstSeq;
        existing.mainYn = mainYn;
        await this.songArtistRepository.save(existing);
        continue;
      }
      await this.songArtistRepository.save(
        this.songArtistRepository.create({
          songId,
          atstId: artist.atstId,
          atstSeq,
          mainYn,
        }),
      );
    }
  }

  async linkAlbumArtists(albmId: string, artists: Artist[]): Promise<void> {
    for (const [index, artist] of artists.entries()) {
      const atstSeq = index + 1;
      const mainYn = index === 0 ? 'Y' : 'N';
      const existing = await this.albumArtistRepository.findOne({
        where: { albmId, atstId: artist.atstId },
      });
      if (existing) {
        existing.atstSeq = atstSeq;
        existing.mainYn = mainYn;
        await this.albumArtistRepository.save(existing);
        continue;
      }
      await this.albumArtistRepository.save(
        this.albumArtistRepository.create({
          albmId,
          atstId: artist.atstId,
          atstSeq,
          mainYn,
        }),
      );
    }
  }
}
