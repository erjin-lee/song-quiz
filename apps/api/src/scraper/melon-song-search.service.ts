import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { CacheService } from '../cache/cache.service';
import { Album } from '../quiz/entities/album.entity';
import { Artist } from '../quiz/entities/artist.entity';
import { Song } from '../quiz/entities/song.entity';
import { ArtistLinkService } from './artist-link.service';
import { MelonArtistBriefDto } from './dto/melon-artist-brief.dto';
import { MelonSongSearchResultDto } from './dto/melon-song-search-result.dto';
import { MelonScraperClient } from './melon-scraper.client';

/** 검색 결과를 캐시해두는 시간. 이 시간 안에 고른 곡만 등록할 수 있다. */
const SEARCH_RESULT_CACHE_TTL_SECONDS = 600;

function searchResultCacheKey(melonSongId: string): string {
  return `melon-song-search-result:${melonSongId}`;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (error as { code?: string })?.code === 'ER_DUP_ENTRY';
}

/**
 * 유저가 퀴즈에 담을 곡을 멜론에서 검색하고, 고른 곡을 DB에 멱등하게
 * 등록한다(docs/features/user-quiz-registration/spec.md 3.1, 3.2).
 * ScraperService(아티스트 전체 스크래핑)와 별개로, "검색 결과 한 건"만
 * 다룬다는 점이 다르다.
 *
 * 등록 요청은 melonSongId만 받고, 곡명/앨범명/아티스트명은 search()가 직접
 * 캐시해둔 값만 신뢰한다 - melonSongId 등은 SQ_SONG/SQ_ATST/SQ_ALBM의
 * unique 키라서, 클라이언트가 이 이름들을 자유롭게 보낼 수 있게 하면 한 번
 * 잘못된(또는 악의적인) 이름으로 선점당한 뒤로는 그 멜론 ID를 검색하는 모든
 * 유저가 계속 오염된 이름을 보게 된다.
 */
@Injectable()
export class MelonSongSearchService {
  constructor(
    private readonly melonScraperClient: MelonScraperClient,
    private readonly cacheService: CacheService,
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
    const items = results.map((song) => ({
      melonSongId: song.melonSongId,
      songNm: song.songNm,
      melonAlbmId: song.melonAlbmId,
      albmNm: song.albmNm,
      artists: song.artists,
      displayLabel: `${song.songNm} - ${song.artists
        .map((artist) => artist.atstNm)
        .join(', ')}`,
    }));

    // setStrict: 이 캐시는 등록을 허용하는 유일한 증빙이라, 여러 ECS 태스크가
    // 떠 있는 운영 환경에서 Redis 오류를 프로세스 로컬 캐시로 조용히 폴백하면
    // (일반 set()의 동작) 이 요청을 처리한 태스크에만 결과가 남고 다른
    // 태스크로 간 등록 요청은 "검색 결과가 만료됐습니다"로 실패한다 - 그런
    // 조용한 실패보다는 캐시 저장 실패를 그대로 던져 500으로 드러내는 편이 낫다.
    await Promise.all(
      items.map((item) =>
        this.cacheService.setStrict(
          searchResultCacheKey(item.melonSongId),
          item,
          SEARCH_RESULT_CACHE_TTL_SECONDS,
        ),
      ),
    );

    return items;
  }

  async registerFromMelonSongId(melonSongId: string): Promise<Song> {
    const existingSong = await this.songRepository.findOne({
      where: { melonSongId },
    });
    if (existingSong) {
      return existingSong;
    }

    const cached = await this.cacheService.getStrict<MelonSongSearchResultDto>(
      searchResultCacheKey(melonSongId),
    );
    if (!cached) {
      throw new BadRequestException(
        '검색 결과가 만료됐습니다. 다시 검색해주세요.',
      );
    }

    return this.songRepository.manager.transaction(async (manager) => {
      const artists = await this.getOrCreateArtists(manager, cached.artists);
      const album = await this.getOrCreateAlbum(
        manager,
        cached.melonAlbmId,
        cached.albmNm,
        artists,
      );

      let song: Song;
      try {
        song = await manager.save(
          Song,
          manager.create(Song, {
            melonSongId: cached.melonSongId,
            songNm: cached.songNm,
            albmId: album.albmId,
            atstId: artists[0].atstId,
          }),
        );
      } catch (error) {
        if (!isDuplicateKeyError(error)) {
          throw error;
        }
        // 동시에 같은 신규 곡을 등록한 경우 unique(melonSongId) 충돌 - 재조회한다.
        // 이 트랜잭션은 위 getOrCreateArtists/getOrCreateAlbum 조회 시점에
        // REPEATABLE READ 스냅샷이 이미 떠서, 일반 조회로는 방금 다른
        // 트랜잭션이 커밋한 행이 안 보일 수 있다 - 락 조회로 최신 커밋본을 읽는다.
        const retried = await manager.findOne(Song, {
          where: { melonSongId: cached.melonSongId },
          lock: { mode: 'pessimistic_read' },
        });
        if (retried) {
          return retried;
        }
        throw error;
      }

      await this.artistLinkService.linkSongArtists(
        song.songId,
        artists,
        manager,
      );
      return song;
    });
  }

  private async getOrCreateArtists(
    manager: EntityManager,
    artists: MelonArtistBriefDto[],
  ): Promise<Artist[]> {
    const created: Artist[] = [];
    for (const artist of artists) {
      created.push(
        await this.getOrCreateArtist(
          manager,
          artist.melonArtistId,
          artist.atstNm,
        ),
      );
    }
    return created;
  }

  private async getOrCreateArtist(
    manager: EntityManager,
    melonArtistId: string,
    atstNm: string,
  ): Promise<Artist> {
    const existing = await manager.findOne(Artist, {
      where: { melonAtstId: melonArtistId },
    });
    if (existing) {
      return existing;
    }

    try {
      return await manager.save(
        Artist,
        manager.create(Artist, {
          melonAtstId: melonArtistId,
          atstNm,
          thumbImgUrl: null,
        }),
      );
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
      const retried = await manager.findOne(Artist, {
        where: { melonAtstId: melonArtistId },
        lock: { mode: 'pessimistic_read' },
      });
      if (retried) {
        return retried;
      }
      throw error;
    }
  }

  private async getOrCreateAlbum(
    manager: EntityManager,
    melonAlbmId: string,
    albmNm: string,
    artists: Artist[],
  ): Promise<Album> {
    const existing = await manager.findOne(Album, { where: { melonAlbmId } });
    if (existing) {
      return existing;
    }

    let album: Album;
    try {
      album = await manager.save(
        Album,
        manager.create(Album, {
          melonAlbmId,
          albmNm,
          atstId: artists[0].atstId,
          thumbImgUrl: null,
          rlsDt: null,
        }),
      );
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
      const retried = await manager.findOne(Album, {
        where: { melonAlbmId },
        lock: { mode: 'pessimistic_read' },
      });
      if (retried) {
        return retried;
      }
      throw error;
    }

    await this.artistLinkService.linkAlbumArtists(
      album.albmId,
      artists,
      manager,
    );
    return album;
  }
}
