import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Album } from '../quiz/entities/album.entity';
import { Artist } from '../quiz/entities/artist.entity';
import { Song } from '../quiz/entities/song.entity';
import { ArtistLinkService } from './artist-link.service';
import { MelonArtistBriefDto } from './dto/melon-artist-brief.dto';
import { MelonSongSearchResultDto } from './dto/melon-song-search-result.dto';
import { RegisterSongFromMelonRequestDto } from './dto/register-song-from-melon-request.dto';
import { MelonScraperClient } from './melon-scraper.client';

/**
 * 유저가 퀴즈에 담을 곡을 멜론에서 검색하고, 고른 곡을 DB에 멱등하게
 * 등록한다(docs/features/user-quiz-registration/spec.md 3.1, 3.2).
 * ScraperService(아티스트 전체 스크래핑)와 별개로, "검색 결과 한 건"만
 * 다룬다는 점이 다르다.
 */
@Injectable()
export class MelonSongSearchService {
  constructor(
    private readonly melonScraperClient: MelonScraperClient,
    @InjectRepository(Artist)
    private readonly artistRepository: Repository<Artist>,
    @InjectRepository(Album)
    private readonly albumRepository: Repository<Album>,
    @InjectRepository(Song)
    private readonly songRepository: Repository<Song>,
    private readonly artistLinkService: ArtistLinkService,
  ) {}

  async search(keyword: string): Promise<MelonSongSearchResultDto[]> {
    const trimmed = keyword.trim();
    if (!trimmed) {
      return [];
    }

    const results = await this.melonScraperClient.searchSongs(trimmed);
    return results.map((song) => ({
      melonSongId: song.melonSongId,
      songNm: song.songNm,
      melonAlbmId: song.melonAlbmId,
      albmNm: song.albmNm,
      artists: song.artists,
      displayLabel: `${song.songNm} - ${song.artists
        .map((artist) => artist.atstNm)
        .join(', ')}`,
    }));
  }

  async registerFromSearchResult(
    dto: RegisterSongFromMelonRequestDto,
  ): Promise<Song> {
    const existingSong = await this.songRepository.findOne({
      where: { melonSongId: dto.melonSongId },
    });
    if (existingSong) {
      return existingSong;
    }

    const artists = await this.getOrCreateArtists(dto.artists);
    const album = await this.getOrCreateAlbum(
      dto.melonAlbmId,
      dto.albmNm,
      artists,
    );

    try {
      const song = await this.songRepository.save(
        this.songRepository.create({
          melonSongId: dto.melonSongId,
          songNm: dto.songNm,
          albmId: album.albmId,
          atstId: artists[0].atstId,
        }),
      );
      await this.artistLinkService.linkSongArtists(song.songId, artists);
      return song;
    } catch (error) {
      // 동시에 같은 신규 곡을 등록한 경우 unique(melonSongId) 충돌 - 재조회한다.
      const retried = await this.songRepository.findOne({
        where: { melonSongId: dto.melonSongId },
      });
      if (retried) {
        return retried;
      }
      throw error;
    }
  }

  private async getOrCreateArtists(
    artists: MelonArtistBriefDto[],
  ): Promise<Artist[]> {
    const created: Artist[] = [];
    for (const artist of artists) {
      created.push(
        await this.getOrCreateArtist(artist.melonArtistId, artist.atstNm),
      );
    }
    return created;
  }

  private async getOrCreateArtist(
    melonArtistId: string,
    atstNm: string,
  ): Promise<Artist> {
    const existing = await this.artistRepository.findOne({
      where: { melonAtstId: melonArtistId },
    });
    if (existing) {
      return existing;
    }

    try {
      return await this.artistRepository.save(
        this.artistRepository.create({
          melonAtstId: melonArtistId,
          atstNm,
          thumbImgUrl: null,
        }),
      );
    } catch (error) {
      const retried = await this.artistRepository.findOne({
        where: { melonAtstId: melonArtistId },
      });
      if (retried) {
        return retried;
      }
      throw error;
    }
  }

  private async getOrCreateAlbum(
    melonAlbmId: string,
    albmNm: string,
    artists: Artist[],
  ): Promise<Album> {
    const existing = await this.albumRepository.findOne({
      where: { melonAlbmId },
    });
    if (existing) {
      return existing;
    }

    try {
      const album = await this.albumRepository.save(
        this.albumRepository.create({
          melonAlbmId,
          albmNm,
          atstId: artists[0].atstId,
          thumbImgUrl: null,
          rlsDt: null,
        }),
      );
      await this.artistLinkService.linkAlbumArtists(album.albmId, artists);
      return album;
    } catch (error) {
      const retried = await this.albumRepository.findOne({
        where: { melonAlbmId },
      });
      if (retried) {
        return retried;
      }
      throw error;
    }
  }
}
