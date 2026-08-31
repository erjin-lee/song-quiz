import {
  BadGatewayException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Album } from '../quiz/entities/album.entity';
import { Artist } from '../quiz/entities/artist.entity';
import { Song } from '../quiz/entities/song.entity';
import { ArtistLinkService } from './artist-link.service';
import { ScrapeArtistResultDto } from './dto/scrape-artist-result.dto';
import {
  MelonFetchError,
  MelonScraperClient,
  ScrapedAlbum,
  ScrapedSong,
} from './melon-scraper.client';

@Injectable()
export class ScraperService {
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

  async scrapeArtist(melonArtistId: string): Promise<ScrapeArtistResultDto> {
    const scrapedArtist = await this.wrapMelonCall(() =>
      this.melonScraperClient.fetchArtist(melonArtistId),
    );
    if (!scrapedArtist) {
      throw new NotFoundException(
        `멜론 아티스트를 찾을 수 없습니다. (artistId: ${melonArtistId})`,
      );
    }
    const artist = await this.saveArtist(
      melonArtistId,
      scrapedArtist.atstNm,
      scrapedArtist.thumbImgUrl,
    );

    const artistCache = new Map<string, Artist>([[melonArtistId, artist]]);

    const scrapedAlbums = await this.wrapMelonCall(() =>
      this.melonScraperClient.fetchAlbums(melonArtistId),
    );

    const savedAlbumByMelonId = new Map<string, Album>();
    const albumArtistsByMelonId = new Map<string, Artist[]>();
    let skippedAlbumCount = 0;
    for (const scrapedAlbum of scrapedAlbums) {
      if (scrapedAlbum.artistIds.length === 0) {
        skippedAlbumCount++;
        continue;
      }
      const albumArtists = await this.getOrCreateArtists(
        scrapedAlbum.artistIds,
        artistCache,
      );
      const savedAlbum = await this.saveAlbum(
        albumArtists[0].atstId,
        scrapedAlbum,
      );
      await this.artistLinkService.linkAlbumArtists(
        savedAlbum.albmId,
        albumArtists,
      );
      savedAlbumByMelonId.set(scrapedAlbum.melonAlbmId, savedAlbum);
      albumArtistsByMelonId.set(scrapedAlbum.melonAlbmId, albumArtists);
    }

    const scrapedSongs = await this.wrapMelonCall(() =>
      this.melonScraperClient.fetchSongs(melonArtistId),
    );
    let savedSongCount = 0;
    let skippedSongCount = 0;
    for (const scrapedSong of scrapedSongs) {
      const album = scrapedSong.melonAlbmId
        ? savedAlbumByMelonId.get(scrapedSong.melonAlbmId)
        : undefined;
      const songArtists = scrapedSong.melonAlbmId
        ? albumArtistsByMelonId.get(scrapedSong.melonAlbmId)
        : undefined;
      if (!album || !songArtists) {
        skippedSongCount++;
        continue;
      }
      const savedSong = await this.saveSong(
        songArtists[0].atstId,
        album,
        scrapedSong,
      );
      await this.artistLinkService.linkSongArtists(
        savedSong.songId,
        songArtists,
      );
      savedSongCount++;
    }

    return {
      atstId: artist.atstId,
      melonAtstId: artist.melonAtstId,
      atstNm: artist.atstNm,
      savedAlbumCount: scrapedAlbums.length - skippedAlbumCount,
      skippedAlbumCount,
      savedSongCount,
      skippedSongCount,
    };
  }

  private async getOrCreateArtists(
    melonArtistIds: string[],
    cache: Map<string, Artist>,
  ): Promise<Artist[]> {
    const artists: Artist[] = [];
    for (const melonArtistId of melonArtistIds) {
      artists.push(await this.getOrCreateArtistByMelonId(melonArtistId, cache));
    }
    return artists;
  }

  private async getOrCreateArtistByMelonId(
    melonArtistId: string,
    cache: Map<string, Artist>,
  ): Promise<Artist> {
    const cached = cache.get(melonArtistId);
    if (cached) {
      return cached;
    }

    const existing = await this.artistRepository.findOne({
      where: { melonAtstId: melonArtistId },
    });
    if (existing) {
      cache.set(melonArtistId, existing);
      return existing;
    }

    const fetched = await this.wrapMelonCall(() =>
      this.melonScraperClient.fetchArtist(melonArtistId),
    );
    const created = await this.saveArtist(
      melonArtistId,
      fetched?.atstNm ?? melonArtistId,
      fetched?.thumbImgUrl ?? null,
    );
    cache.set(melonArtistId, created);
    return created;
  }

  private async saveArtist(
    melonArtistId: string,
    atstNm: string,
    thumbImgUrl: string | null,
  ): Promise<Artist> {
    const existing = await this.artistRepository.findOne({
      where: { melonAtstId: melonArtistId },
    });
    if (existing) {
      existing.atstNm = atstNm;
      existing.thumbImgUrl = thumbImgUrl;
      return this.artistRepository.save(existing);
    }

    const created = this.artistRepository.create({
      melonAtstId: melonArtistId,
      atstNm,
      thumbImgUrl,
    });
    return this.artistRepository.save(created);
  }

  private async saveAlbum(
    atstId: string,
    scrapedAlbum: ScrapedAlbum,
  ): Promise<Album> {
    const existing = await this.albumRepository.findOne({
      where: { melonAlbmId: scrapedAlbum.melonAlbmId },
    });
    if (existing) {
      existing.albmNm = scrapedAlbum.albmNm;
      existing.thumbImgUrl = scrapedAlbum.thumbImgUrl;
      existing.rlsDt = scrapedAlbum.rlsDt;
      return this.albumRepository.save(existing);
    }

    const created = this.albumRepository.create({
      atstId,
      melonAlbmId: scrapedAlbum.melonAlbmId,
      albmNm: scrapedAlbum.albmNm,
      thumbImgUrl: scrapedAlbum.thumbImgUrl,
      rlsDt: scrapedAlbum.rlsDt,
    });
    return this.albumRepository.save(created);
  }

  private async saveSong(
    atstId: string,
    album: Album,
    scrapedSong: ScrapedSong,
  ): Promise<Song> {
    const existing = await this.songRepository.findOne({
      where: { melonSongId: scrapedSong.melonSongId },
    });
    if (existing) {
      existing.songNm = scrapedSong.songNm;
      existing.titleYn = scrapedSong.titleYn;
      existing.albmId = album.albmId;
      existing.rlsDt = album.rlsDt;
      return this.songRepository.save(existing);
    }

    const created = this.songRepository.create({
      albmId: album.albmId,
      atstId,
      melonSongId: scrapedSong.melonSongId,
      songNm: scrapedSong.songNm,
      titleYn: scrapedSong.titleYn,
      rlsDt: album.rlsDt,
    });
    return this.songRepository.save(created);
  }

  private async wrapMelonCall<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof MelonFetchError) {
        throw new BadGatewayException(error.message);
      }
      throw error;
    }
  }
}
