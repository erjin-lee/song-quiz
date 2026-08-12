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
import { QuizSongReuseService } from '../quiz/quiz-song-reuse.service';
import { ScrapeChartResultDto } from './dto/scrape-chart-result.dto';
import {
  ChartType,
  MelonFetchError,
  MelonScraperClient,
  ScrapedChartArtist,
  ScrapedChartSong,
} from './melon-scraper.client';

const DECADE_UNIT = 10;

@Injectable()
export class ChartScraperService {
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
    private readonly quizSongReuseService: QuizSongReuseService,
  ) {}

  async scrapeChart(
    type: ChartType,
    year: number,
  ): Promise<ScrapeChartResultDto> {
    if (type === ChartType.AG && (year <= 0 || year % DECADE_UNIT !== 0)) {
      throw new BadRequestException(
        `연대별 차트는 10년 단위 연도여야 합니다. (year: ${year})`,
      );
    }
    if (type === ChartType.YE && year <= 0) {
      throw new BadRequestException(
        `연도별 차트는 유효한 연도여야 합니다. (year: ${year})`,
      );
    }

    const chartSongs = await this.wrapMelonCall(() =>
      this.melonScraperClient.fetchAgeChartSongs(String(year), type),
    );
    if (chartSongs.length === 0) {
      throw new NotFoundException(
        `멜론 차트를 찾을 수 없습니다. (type: ${type}, year: ${year})`,
      );
    }

    const { quizTtl, quizDesc } = this.buildQuizMeta(type, year);
    const quiz = await this.quizRepository.save(
      this.quizRepository.create({
        quizTtl,
        quizDesc,
        thumbImgUrl: chartSongs[0].albumThumbImgUrl,
      }),
    );

    const artistByMelonId = new Map<string, Artist>();
    const albumByMelonId = new Map<string, Album>();
    let savedArtistCount = 0;
    let savedSongCount = 0;
    let skippedSongCount = 0;
    let reusedYoutubeCount = 0;
    let reusedAnswerCount = 0;
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

      const reusableYoutubeInfo =
        await this.quizSongReuseService.findReusableYoutubeInfo(song.songId);
      if (reusableYoutubeInfo) {
        reusedYoutubeCount++;
      }

      const quizSong = await this.quizSongRepository.save(
        this.quizSongRepository.create({
          quizId: quiz.quizId,
          songId: song.songId,
          quizSeq: quizSeq++,
          youtubeUrl: reusableYoutubeInfo?.youtubeUrl ?? '',
          youtubeVideoId: reusableYoutubeInfo?.youtubeVideoId ?? null,
          startSec: reusableYoutubeInfo?.startSec ?? 0,
          endSec: reusableYoutubeInfo?.endSec ?? null,
        }),
      );

      reusedAnswerCount += await this.quizSongReuseService.copyReusableAnswers(
        song.songId,
        quizSong.quizSongId,
      );
    }

    return {
      type,
      year,
      quizId: quiz.quizId,
      quizTtl: quiz.quizTtl,
      quizDesc: quiz.quizDesc ?? quizDesc,
      chartSongCount: chartSongs.length,
      savedArtistCount,
      savedSongCount,
      skippedSongCount,
      savedQuizSongCount: chartSongs.length,
      reusedYoutubeCount,
      reusedAnswerCount,
    };
  }

  private buildQuizMeta(
    type: ChartType,
    year: number,
  ): { quizTtl: string; quizDesc: string } {
    if (type === ChartType.AG) {
      return {
        quizTtl: `${year}년대 인기곡`,
        quizDesc: `${year} ~ ${year + DECADE_UNIT} 멜론 인기 차트 곡 입니다.`,
      };
    }
    return {
      quizTtl: `${year}년 인기곡`,
      quizDesc: `${year} 멜론 인기 차트 곡 입니다.`,
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
