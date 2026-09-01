import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { delay } from '../common/delay';
import { FillQuizAnswersResultDto } from './dto/fill-quiz-answers-result.dto';
import { QuizAnswer } from './entities/quiz-answer.entity';
import { QuizSong } from './entities/quiz-song.entity';
import { GptAnswerCandidate, GptAnswerClient } from './gpt-answer.client';
import { QuizSongReuseService } from './quiz-song-reuse.service';

const GPT_SONGS_PER_REQUEST = 50;
const GPT_BATCH_REQUEST_DELAY_MS = 1000;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

@Injectable()
export class QuizAnswerGeneratorService {
  private readonly logger = new Logger(QuizAnswerGeneratorService.name);

  constructor(
    private readonly gptAnswerClient: GptAnswerClient,
    @InjectRepository(QuizSong)
    private readonly quizSongRepository: Repository<QuizSong>,
    @InjectRepository(QuizAnswer)
    private readonly quizAnswerRepository: Repository<QuizAnswer>,
    private readonly quizSongReuseService: QuizSongReuseService,
  ) {}

  async fillAnswers(): Promise<FillQuizAnswersResultDto> {
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
      .leftJoin('quizSong.answers', 'answer')
      .where('answer.quizAnswerId IS NULL')
      .andWhere('quizSong.youtubeUrl != :emptyUrl', { emptyUrl: '' })
      .orderBy('quizSong.quizSongId', 'ASC')
      .getMany();
    if (quizSongs.length === 0) {
      throw new BadRequestException(
        '정답이 없는 출제곡이 없어 채울 대상이 없습니다.',
      );
    }

    let reusedSongCount = 0;
    let reusedAnswerCount = 0;
    const remainingQuizSongs: typeof quizSongs = [];

    for (const quizSong of quizSongs) {
      const copiedCount = await this.quizSongReuseService.copyReusableAnswers(
        quizSong.songId,
        quizSong.quizSongId,
      );
      if (copiedCount > 0) {
        reusedSongCount++;
        reusedAnswerCount += copiedCount;
      } else {
        remainingQuizSongs.push(quizSong);
      }
    }

    let savedSongCount = 0;
    let savedAnswerCount = 0;
    let skippedSongCount = 0;

    const chunks = chunk(remainingQuizSongs, GPT_SONGS_PER_REQUEST);
    for (let i = 0; i < chunks.length; i++) {
      const songChunk = chunks[i];
      const answersByQuizSongId = await this.generateChunkAnswers(songChunk);

      const answerEntities: QuizAnswer[] = [];
      for (const quizSong of songChunk) {
        const answers = answersByQuizSongId.get(quizSong.quizSongId);
        if (!answers || answers.length === 0) {
          skippedSongCount++;
          continue;
        }

        for (const candidate of answers) {
          answerEntities.push(
            this.quizAnswerRepository.create({
              quizSongId: quizSong.quizSongId,
              answerTxt: candidate.answerTxt,
              answerType: candidate.answerType,
              confidence: candidate.confidence,
            }),
          );
        }
        savedAnswerCount += answers.length;
        savedSongCount++;
      }

      if (answerEntities.length > 0) {
        await this.quizAnswerRepository.save(answerEntities);
      }

      if (i < chunks.length - 1) {
        await delay(GPT_BATCH_REQUEST_DELAY_MS);
      }
    }

    return {
      targetSongCount: quizSongs.length,
      savedSongCount,
      savedAnswerCount,
      skippedSongCount,
      reusedSongCount,
      reusedAnswerCount,
    };
  }

  private async generateChunkAnswers(
    songChunk: QuizSong[],
  ): Promise<Map<string, GptAnswerCandidate[]>> {
    try {
      return await this.gptAnswerClient.generateAnswersBatch(
        songChunk.map((quizSong) => ({
          quizSongId: quizSong.quizSongId,
          songNm: quizSong.song.songNm,
          atstNm: quizSong.song.songArtists[0].artist.atstNm,
        })),
      );
    } catch (error) {
      this.logger.warn(
        `GPT 배치 정답 생성 실패, ${songChunk.length}곡을 건너뜁니다.`,
        error,
      );
      return new Map();
    }
  }
}
