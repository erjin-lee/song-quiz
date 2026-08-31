import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { delay } from '../common/delay';
import { FillQuizYoutubeLinksResultDto } from './dto/fill-quiz-youtube-links-result.dto';
import { GenerateQuizResultDto } from './dto/generate-quiz-result.dto';
import { Artist } from './entities/artist.entity';
import { QuizSong } from './entities/quiz-song.entity';
import { Quiz } from './entities/quiz.entity';
import { Song } from './entities/song.entity';
import { QuizSongReuseService } from './quiz-song-reuse.service';
import { YoutubeScraperClient } from './youtube-scraper.client';

const YOUTUBE_REQUEST_DELAY_MS = 300;
const YOUTUBE_BATCH_SIZE = 10;
const YOUTUBE_BATCH_DELAY_MS = 3000;
const QUIZ_SONG_CLIP_SEC = 30;

@Injectable()
export class QuizGeneratorService {
  private readonly logger = new Logger(QuizGeneratorService.name);

  constructor(
    private readonly youtubeScraperClient: YoutubeScraperClient,
    @InjectRepository(Artist)
    private readonly artistRepository: Repository<Artist>,
    @InjectRepository(Song)
    private readonly songRepository: Repository<Song>,
    @InjectRepository(Quiz)
    private readonly quizRepository: Repository<Quiz>,
    @InjectRepository(QuizSong)
    private readonly quizSongRepository: Repository<QuizSong>,
    private readonly quizSongReuseService: QuizSongReuseService,
  ) {}

  async generateQuiz(atstId: string): Promise<GenerateQuizResultDto> {
    const artist = await this.artistRepository.findOne({ where: { atstId } });
    if (!artist) {
      throw new NotFoundException(
        `아티스트를 찾을 수 없습니다. (atstId: ${atstId})`,
      );
    }

    const songs = await this.songRepository
      .createQueryBuilder('song')
      .innerJoin(
        'song.songArtists',
        'songArtist',
        'songArtist.atstId = :atstId',
        { atstId },
      )
      .where('song.ytbLink IS NULL')
      .orderBy('song.songId', 'ASC')
      .getMany();
    if (songs.length === 0) {
      throw new BadRequestException(
        `유튜브 링크가 없는 곡이 없어 퀴즈를 생성할 수 없습니다. (atstId: ${atstId})`,
      );
    }

    const quizDesc = `${artist.atstNm} - 노래 맞추기`;
    const quiz = await this.quizRepository.save(
      this.quizRepository.create({
        quizTtl: artist.atstNm,
        quizDesc,
      }),
    );

    let quizSeq = 1;
    let savedSongCount = 0;
    let skippedSongCount = 0;

    for (let i = 0; i < songs.length; i++) {
      const song = songs[i];
      const result = await this.searchSongVideo(
        artist.atstNm,
        song.songNm,
        `songId: ${song.songId}`,
      );
      if (!result) {
        skippedSongCount++;
        await this.waitBetweenYoutubeRequests(i + 1);
        continue;
      }

      const startSec = Math.round(result.durationSec / 2);
      const youtubeUrl = `https://www.youtube.com/watch?v=${result.videoId}&t=${startSec}`;

      song.ytbLink = youtubeUrl;
      await this.songRepository.save(song);

      await this.quizSongRepository.save(
        this.quizSongRepository.create({
          quizId: quiz.quizId,
          songId: song.songId,
          quizSeq: quizSeq++,
          youtubeUrl,
          youtubeVideoId: result.videoId,
          durationSec: result.durationSec,
          startSec,
          endSec: startSec + QUIZ_SONG_CLIP_SEC,
        }),
      );
      savedSongCount++;

      await this.waitBetweenYoutubeRequests(i + 1);
    }

    return {
      quizId: quiz.quizId,
      quizTtl: quiz.quizTtl,
      quizDesc: quiz.quizDesc ?? quizDesc,
      targetSongCount: songs.length,
      savedSongCount,
      skippedSongCount,
    };
  }

  async fillYoutubeLinks(
    quizId: string,
  ): Promise<FillQuizYoutubeLinksResultDto> {
    const quiz = await this.quizRepository.findOne({ where: { quizId } });
    if (!quiz) {
      throw new NotFoundException(
        `퀴즈를 찾을 수 없습니다. (quizId: ${quizId})`,
      );
    }

    const quizSongs = await this.quizSongRepository
      .createQueryBuilder('quizSong')
      .innerJoinAndSelect('quizSong.song', 'song')
      .innerJoin(
        'song.songArtists',
        'songArtist',
        'songArtist.mainYn = :mainYn',
        { mainYn: 'Y' },
      )
      .innerJoinAndSelect('songArtist.artist', 'artist')
      .where('quizSong.quizId = :quizId', { quizId })
      .andWhere('quizSong.youtubeUrl = :emptyUrl', { emptyUrl: '' })
      .orderBy('quizSong.quizSeq', 'ASC')
      .getMany();
    if (quizSongs.length === 0) {
      throw new BadRequestException(
        `유튜브 링크가 없는 출제곡이 없어 채울 대상이 없습니다. (quizId: ${quizId})`,
      );
    }

    let reusedYoutubeCount = 0;
    let reusedAnswerCount = 0;
    const remainingQuizSongs: typeof quizSongs = [];

    for (const quizSong of quizSongs) {
      const reusable = await this.quizSongReuseService.findReusableYoutubeInfo(
        quizSong.songId,
      );
      if (!reusable) {
        remainingQuizSongs.push(quizSong);
        continue;
      }

      quizSong.youtubeUrl = reusable.youtubeUrl;
      quizSong.youtubeVideoId = reusable.youtubeVideoId;
      quizSong.durationSec = reusable.durationSec;
      quizSong.startSec = reusable.startSec;
      quizSong.endSec = reusable.endSec;
      await this.quizSongRepository.save(quizSong);

      if (!quizSong.song.ytbLink) {
        quizSong.song.ytbLink = reusable.youtubeUrl;
        await this.songRepository.save(quizSong.song);
      }

      reusedYoutubeCount++;
      reusedAnswerCount += await this.quizSongReuseService.copyReusableAnswers(
        quizSong.songId,
        quizSong.quizSongId,
      );
    }

    let savedSongCount = 0;
    let skippedSongCount = 0;

    for (let i = 0; i < remainingQuizSongs.length; i++) {
      const quizSong = remainingQuizSongs[i];
      const result = await this.searchSongVideo(
        quizSong.song.songArtists[0].artist.atstNm,
        quizSong.song.songNm,
        `quizSongId: ${quizSong.quizSongId}`,
      );
      if (!result) {
        skippedSongCount++;
        await this.waitBetweenYoutubeRequests(i + 1);
        continue;
      }

      const startSec = Math.round(result.durationSec / 2);
      const youtubeUrl = `https://www.youtube.com/watch?v=${result.videoId}&t=${startSec}`;

      quizSong.youtubeUrl = youtubeUrl;
      quizSong.youtubeVideoId = result.videoId;
      quizSong.durationSec = result.durationSec;
      quizSong.startSec = startSec;
      quizSong.endSec = startSec + QUIZ_SONG_CLIP_SEC;
      await this.quizSongRepository.save(quizSong);

      if (!quizSong.song.ytbLink) {
        quizSong.song.ytbLink = youtubeUrl;
        await this.songRepository.save(quizSong.song);
      }
      savedSongCount++;

      await this.waitBetweenYoutubeRequests(i + 1);
    }

    return {
      quizId: quiz.quizId,
      quizTtl: quiz.quizTtl,
      targetSongCount: quizSongs.length,
      savedSongCount,
      skippedSongCount,
      reusedYoutubeCount,
      reusedAnswerCount,
    };
  }

  private async waitBetweenYoutubeRequests(
    processedCount: number,
  ): Promise<void> {
    await delay(YOUTUBE_REQUEST_DELAY_MS);
    if (processedCount % YOUTUBE_BATCH_SIZE === 0) {
      await delay(YOUTUBE_BATCH_DELAY_MS);
    }
  }

  private async searchSongVideo(
    atstNm: string,
    songNm: string,
    logContext: string,
  ) {
    try {
      return await this.youtubeScraperClient.search(
        `${atstNm} - ${songNm}`,
        logContext,
      );
    } catch (error) {
      this.logger.warn(
        `유튜브 검색 실패, 곡을 건너뜁니다. (${atstNm} - ${songNm})`,
        error,
      );
      return null;
    }
  }
}
