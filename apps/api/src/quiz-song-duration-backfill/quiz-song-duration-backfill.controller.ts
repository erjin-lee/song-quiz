import { Controller, Logger, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { delay } from '../common/delay';
import { QuizSong } from '../quiz/entities/quiz-song.entity';
import { YoutubeScraperClient } from '../quiz/youtube-scraper.client';

const YOUTUBE_REQUEST_DELAY_MS = 300;
const YOUTUBE_BATCH_SIZE = 10;
const YOUTUBE_BATCH_DELAY_MS = 2000;

interface BackfillQuizSongDurationResult {
  targetVideoCount: number;
  updatedVideoCount: number;
  failedVideoCount: number;
  updatedQuizSongCount: number;
}

/**
 * 1회성 데이터 백필용 엔드포인트.
 * SQ_QUIZ_SONG 중 DURATION이 비어 있는 유튜브 영상을 YOUTUBE_VIDEO_ID 기준으로
 * 묶어 한 번만 스크래핑하고, 동일 영상을 쓰는 모든 출제곡에 일괄 반영한다.
 * DURATION IS NULL만 대상으로 하므로 여러 번 호출해도 안전하다(멱등).
 */
@ApiTags('quiz-song-duration-backfill')
@Controller('quiz-songs')
export class QuizSongDurationBackfillController {
  private readonly logger = new Logger(QuizSongDurationBackfillController.name);

  constructor(
    @InjectRepository(QuizSong)
    private readonly quizSongRepository: Repository<QuizSong>,
    private readonly youtubeScraperClient: YoutubeScraperClient,
  ) {}

  @Post('backfill-duration')
  @ApiOperation({ summary: '[1회성] 출제곡 유튜브 영상 길이(DURATION) 백필' })
  async backfillDuration(): Promise<BackfillQuizSongDurationResult> {
    const targets = await this.quizSongRepository
      .createQueryBuilder('quizSong')
      .select('quizSong.youtubeVideoId', 'youtubeVideoId')
      .where('quizSong.youtubeVideoId IS NOT NULL')
      .andWhere('quizSong.durationSec IS NULL')
      .groupBy('quizSong.youtubeVideoId')
      .getRawMany<{ youtubeVideoId: string }>();

    let updatedVideoCount = 0;
    let failedVideoCount = 0;
    let updatedQuizSongCount = 0;

    for (let i = 0; i < targets.length; i++) {
      const { youtubeVideoId } = targets[i];

      try {
        const durationSec = await this.youtubeScraperClient.getDurationSec(
          youtubeVideoId,
          `youtubeVideoId: ${youtubeVideoId}`,
        );
        if (durationSec === null) {
          failedVideoCount++;
        } else {
          const result = await this.quizSongRepository.update(
            { youtubeVideoId },
            { durationSec },
          );
          updatedVideoCount++;
          updatedQuizSongCount += result.affected ?? 0;
        }
      } catch (error) {
        failedVideoCount++;
        this.logger.warn(
          `영상 길이 스크래핑 실패, 건너뜁니다. (youtubeVideoId: ${youtubeVideoId})`,
          error,
        );
      }

      await delay(YOUTUBE_REQUEST_DELAY_MS);
      if ((i + 1) % YOUTUBE_BATCH_SIZE === 0) {
        await delay(YOUTUBE_BATCH_DELAY_MS);
      }
    }

    return {
      targetVideoCount: targets.length,
      updatedVideoCount,
      failedVideoCount,
      updatedQuizSongCount,
    };
  }
}
