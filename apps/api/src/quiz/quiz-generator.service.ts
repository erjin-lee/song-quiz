import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { GenerateQuizResultDto } from './dto/generate-quiz-result.dto';
import { Artist } from './entities/artist.entity';
import { QuizSong } from './entities/quiz-song.entity';
import { Quiz } from './entities/quiz.entity';
import { Song } from './entities/song.entity';
import { YoutubeScraperClient, delay } from './youtube-scraper.client';

const YOUTUBE_REQUEST_DELAY_MS = 300;
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
  ) {}

  async generateQuiz(atstId: string): Promise<GenerateQuizResultDto> {
    const artist = await this.artistRepository.findOne({ where: { atstId } });
    if (!artist) {
      throw new NotFoundException(`아티스트를 찾을 수 없습니다. (atstId: ${atstId})`);
    }

    const songs = await this.songRepository.find({
      where: { atstId, ytbLink: IsNull() },
      order: { songId: 'ASC' },
    });
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

    for (const song of songs) {
      const result = await this.searchSongVideo(artist.atstNm, song.songNm);
      if (!result) {
        skippedSongCount++;
        await delay(YOUTUBE_REQUEST_DELAY_MS);
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
          startSec,
          endSec: startSec + QUIZ_SONG_CLIP_SEC,
        }),
      );
      savedSongCount++;

      await delay(YOUTUBE_REQUEST_DELAY_MS);
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

  private async searchSongVideo(atstNm: string, songNm: string) {
    try {
      return await this.youtubeScraperClient.search(`${atstNm} - ${songNm}`);
    } catch (error) {
      this.logger.warn(`유튜브 검색 실패, 곡을 건너뜁니다. (${atstNm} - ${songNm})`, error);
      return null;
    }
  }
}
