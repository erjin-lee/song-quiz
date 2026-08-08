import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { CacheService } from '../cache/cache.service';
import { GetQuizzesQueryDto, QuizSearchType } from './dto/get-quizzes-query.dto';
import { QuizListItemDto } from './dto/quiz-list-item.dto';
import { QuizSongItemDto } from './dto/quiz-song-item.dto';
import { QuizArtist } from './entities/quiz-artist.entity';
import { Quiz } from './entities/quiz.entity';
import { QuizSong } from './entities/quiz-song.entity';

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

  async getQuizzes(query: GetQuizzesQueryDto): Promise<QuizListItemDto[]> {
    const keyword = query.keyword?.trim() ?? '';
    const searchType = query.searchType ?? QuizSearchType.ALL;
    const cacheKey = `quiz:list:${searchType}:${keyword}`;

    return this.cacheService.getOrSet(
      cacheKey,
      () => this.findQuizzes(keyword, searchType),
      QUIZ_LIST_CACHE_TTL_SECONDS,
    );
  }

  private async findQuizzes(
    keyword: string,
    searchType: QuizSearchType,
  ): Promise<QuizListItemDto[]> {
    const qb = this.quizRepository
      .createQueryBuilder('quiz')
      .where('quiz.useYn = :useYn', { useYn: 'Y' });

    if (keyword) {
      const likeKeyword = `%${keyword}%`;

      if (searchType === QuizSearchType.ARTIST || searchType === QuizSearchType.ALL) {
        qb.leftJoin(
          QuizArtist,
          'quizArtist',
          'quizArtist.quizId = quiz.quizId',
        )
          .leftJoin('quizArtist.artist', 'artist')
          .distinct(true);
      }

      if (searchType === QuizSearchType.TITLE) {
        qb.andWhere('quiz.quizTtl LIKE :keyword', { keyword: likeKeyword });
      } else if (searchType === QuizSearchType.ARTIST) {
        qb.andWhere('artist.atstNm LIKE :keyword', { keyword: likeKeyword });
      } else {
        qb.andWhere(
          new Brackets((sub) => {
            sub
              .where('quiz.quizTtl LIKE :keyword', { keyword: likeKeyword })
              .orWhere('artist.atstNm LIKE :keyword', { keyword: likeKeyword });
          }),
        );
      }
    }

    const quizzes = await qb.orderBy('quiz.crtDt', 'DESC').getMany();

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
