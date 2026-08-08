import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CacheService } from '../cache/cache.service';
import { QuizListItemDto } from './dto/quiz-list-item.dto';
import { QuizSongItemDto } from './dto/quiz-song-item.dto';
import { Quiz } from './entities/quiz.entity';
import { QuizSong } from './entities/quiz-song.entity';

const QUIZ_LIST_CACHE_KEY = 'quiz:list';
const QUIZ_LIST_CACHE_TTL_SECONDS = 60;

@Injectable()
export class QuizService {
  constructor(
    @InjectRepository(Quiz)
    private readonly quizRepository: Repository<Quiz>,
    @InjectRepository(QuizSong)
    private readonly quizSongRepository: Repository<QuizSong>,
    private readonly cacheService: CacheService,
  ) {}

  async getQuizzes(): Promise<QuizListItemDto[]> {
    return this.cacheService.getOrSet(
      QUIZ_LIST_CACHE_KEY,
      () => this.findQuizzes(),
      QUIZ_LIST_CACHE_TTL_SECONDS,
    );
  }

  private async findQuizzes(): Promise<QuizListItemDto[]> {
    const quizzes = await this.quizRepository.find({
      where: { useYn: 'Y' },
      order: { crtDt: 'DESC' },
    });

    return quizzes.map((quiz) => ({
      quizId: quiz.quizId,
      quizTtl: quiz.quizTtl,
      quizDesc: quiz.quizDesc,
      thumbImgUrl: quiz.thumbImgUrl,
      playCnt: quiz.playCnt,
    }));
  }

  async getQuizSongs(quizId: string): Promise<QuizSongItemDto[]> {
    const quiz = await this.quizRepository.findOne({ where: { quizId } });
    if (!quiz) {
      throw new NotFoundException(
        `퀴즈를 찾을 수 없습니다. (quizId: ${quizId})`,
      );
    }

    const quizSongs = await this.quizSongRepository
      .createQueryBuilder('quizSong')
      .innerJoinAndSelect('quizSong.song', 'song')
      .innerJoinAndSelect('song.artist', 'artist')
      .innerJoinAndSelect('song.album', 'album')
      .leftJoinAndSelect('quizSong.answers', 'answer')
      .where('quizSong.quizId = :quizId', { quizId })
      .orderBy('quizSong.quizSeq', 'ASC')
      .addOrderBy('answer.quizAnswerId', 'ASC')
      .getMany();

    return quizSongs.map((quizSong) => ({
      quizSongId: quizSong.quizSongId,
      quizSeq: quizSong.quizSeq,
      songId: quizSong.song.songId,
      songNm: quizSong.song.songNm,
      atstNm: quizSong.song.artist.atstNm,
      albmNm: quizSong.song.album.albmNm,
      youtubeUrl: quizSong.youtubeUrl,
      youtubeVideoId: quizSong.youtubeVideoId,
      startSec: quizSong.startSec,
      endSec: quizSong.endSec,
      answers: quizSong.answers.map((answer) => ({
        quizAnswerId: answer.quizAnswerId,
        quizSongId: answer.quizSongId,
        answerTxt: answer.answerTxt,
      })),
    }));
  }
}
