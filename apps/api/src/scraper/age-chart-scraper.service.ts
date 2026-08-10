import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Album } from '../quiz/entities/album.entity';
import { Artist } from '../quiz/entities/artist.entity';
import { QuizSong } from '../quiz/entities/quiz-song.entity';
import { Quiz } from '../quiz/entities/quiz.entity';
import { Song } from '../quiz/entities/song.entity';
import { ScrapeAgeChartResultDto } from './dto/scrape-age-chart-result.dto';
import {
  MelonFetchError,
  MelonScraperClient,
  ScrapedChartArtist,
  ScrapedChartSong,
} from './melon-scraper.client';

const DECADE_UNIT = 10;

@Injectable()
export class AgeChartScraperService {
  constructor(
    private readonly melonScraperClient: MelonScraperClient,
    @InjectRepository(Artist)
    private readonly artistRepository: Repository<Artist>,
    @InjectRepository(Album)
    private readonly albumRepository: Repository<Album>,
    @InjectRepository(Song)
    private readonly songRepository: Repository<Song>,
    @InjectRepository(Quiz)
    private readonly quizRepository: Repository<Quiz>,
    @InjectRepository(QuizSong)
    private readonly quizSongRepository: Repository<QuizSong>,
  ) {}

  async scrapeAgeChart(decade: number): Promise<ScrapeAgeChartResultDto> {
    if (decade <= 0 || decade % DECADE_UNIT !== 0) {
      throw new BadRequestException(
        `연대 값은 10년 단위여야 합니다. (decade: ${decade})`,
      );
    }

    const chartSongs = await this.wrapMelonCall(() =>
      this.melonScraperClient.fetchAgeChartSongs(String(decade)),
    );
    if (chartSongs.length === 0) {
      throw new NotFoundException(
        `멜론 연대별 차트를 찾을 수 없습니다. (decade: ${decade})`,
      );
    }

    const quizTtl = `${decade}년대 인기곡`;
    const quizDesc = `${decade} ~ ${decade + DECADE_UNIT} 멜론 인기 차트 곡 입니다.`;
    const quiz = await this.quizRepository.save(
      this.quizRepository.create({ quizTtl, quizDesc }),
    );

    const artistByMelonId = new Map<string, Artist>();
    const albumByMelonId = new Map<string, Album>();
    let savedArtistCount = 0;
    let savedSongCount = 0;
    let skippedSongCount = 0;
    let quizSeq = 1;

    for (const chartSong of chartSongs) {
      const artists: Artist[] = [];
      for (const scrapedArtist of chartSong.artists) {
        const { artist, created } = await this.getOrCreateArtist(
          scrapedArtist,
          artistByMelonId,
        );
        artists.push(artist);
        if (created) {
          savedArtistCount++;
        }
      }

      // 대표 아티스트(합작곡의 경우 멜론이 첫 번째로 표기하는 아티스트)를 곡/앨범의 소유 아티스트로 사용한다.
      const primaryArtist = artists[0];
      const album = await this.getOrCreateAlbum(
        chartSong,
        primaryArtist.atstId,
        albumByMelonId,
      );
      const { song, created: songCreated } = await this.getOrCreateSong(
        chartSong,
        album,
        primaryArtist.atstId,
      );
      if (songCreated) {
        savedSongCount++;
      } else {
        skippedSongCount++;
      }

      await this.quizSongRepository.save(
        this.quizSongRepository.create({
          quizId: quiz.quizId,
          songId: song.songId,
          quizSeq: quizSeq++,
          youtubeUrl: '',
          youtubeVideoId: null,
          startSec: 0,
          endSec: null,
        }),
      );
    }

    return {
      decade,
      quizId: quiz.quizId,
      quizTtl: quiz.quizTtl,
      quizDesc: quiz.quizDesc ?? quizDesc,
      chartSongCount: chartSongs.length,
      savedArtistCount,
      savedSongCount,
      skippedSongCount,
      savedQuizSongCount: chartSongs.length,
    };
  }

  private async getOrCreateArtist(
    scrapedArtist: ScrapedChartArtist,
    cache: Map<string, Artist>,
  ): Promise<{ artist: Artist; created: boolean }> {
    const cached = cache.get(scrapedArtist.melonArtistId);
    if (cached) {
      return { artist: cached, created: false };
    }

    const existing = await this.artistRepository.findOne({
      where: { melonAtstId: scrapedArtist.melonArtistId },
    });
    if (existing) {
      cache.set(scrapedArtist.melonArtistId, existing);
      return { artist: existing, created: false };
    }

    const fetched = await this.wrapMelonCall(() =>
      this.melonScraperClient.fetchArtist(scrapedArtist.melonArtistId),
    );
    const created = await this.artistRepository.save(
      this.artistRepository.create({
        melonAtstId: scrapedArtist.melonArtistId,
        atstNm: fetched?.atstNm ?? scrapedArtist.atstNm,
        thumbImgUrl: fetched?.thumbImgUrl ?? null,
      }),
    );
    cache.set(scrapedArtist.melonArtistId, created);
    return { artist: created, created: true };
  }

  private async getOrCreateAlbum(
    chartSong: ScrapedChartSong,
    atstId: string,
    cache: Map<string, Album>,
  ): Promise<Album> {
    const cached = cache.get(chartSong.melonAlbmId);
    if (cached) {
      return cached;
    }

    const existing = await this.albumRepository.findOne({
      where: { melonAlbmId: chartSong.melonAlbmId },
    });
    if (existing) {
      cache.set(chartSong.melonAlbmId, existing);
      return existing;
    }

    const created = await this.albumRepository.save(
      this.albumRepository.create({
        atstId,
        melonAlbmId: chartSong.melonAlbmId,
        albmNm: chartSong.albmNm,
        thumbImgUrl: chartSong.albumThumbImgUrl,
        rlsDt: null,
      }),
    );
    cache.set(chartSong.melonAlbmId, created);
    return created;
  }

  private async getOrCreateSong(
    chartSong: ScrapedChartSong,
    album: Album,
    atstId: string,
  ): Promise<{ song: Song; created: boolean }> {
    const existing = await this.songRepository.findOne({
      where: { melonSongId: chartSong.melonSongId },
    });
    if (existing) {
      return { song: existing, created: false };
    }

    const created = await this.songRepository.save(
      this.songRepository.create({
        albmId: album.albmId,
        atstId,
        melonSongId: chartSong.melonSongId,
        songNm: chartSong.songNm,
        rlsDt: null,
        ytbLink: null,
      }),
    );
    return { song: created, created: true };
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
