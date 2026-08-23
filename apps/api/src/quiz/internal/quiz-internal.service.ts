import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { QuizAnswer } from '../entities/quiz-answer.entity';
import { QuizArtist } from '../entities/quiz-artist.entity';
import { QuizSong } from '../entities/quiz-song.entity';
import { Quiz } from '../entities/quiz.entity';
import { QuizRoundDataDto } from './dto/quiz-round-data.dto';
import { QuizSummaryDto } from './dto/quiz-summary.dto';

/**
 * apps/game(RoomService)이 apps/api의 Quiz TypeORM Repository/Entity를 직접 참조하지
 * 않도록, 이 서비스가 그 접근을 대신하고 /internal/quizzes 엔드포인트로만 노출한다.
 * 원래 RoomService에 있던 퀴즈 조회/검증/라운드 데이터 조립 로직을 그대로 옮겼다.
 */
@Injectable()
export class QuizInternalService {
  constructor(
    @InjectRepository(Quiz)
    private readonly quizRepository: Repository<Quiz>,
    @InjectRepository(QuizArtist)
    private readonly quizArtistRepository: Repository<QuizArtist>,
    @InjectRepository(QuizSong)
    private readonly quizSongRepository: Repository<QuizSong>,
    @InjectRepository(QuizAnswer)
    private readonly quizAnswerRepository: Repository<QuizAnswer>,
  ) {}

  async getSummary(quizId: string): Promise<QuizSummaryDto> {
    const quiz = await this.quizRepository.findOne({
      where: { quizId, useYn: 'Y' },
    });
    if (!quiz) {
      throw new NotFoundException(
        `퀴즈를 찾을 수 없습니다. (quizId: ${quizId})`,
      );
    }

    const quizArtists = await this.quizArtistRepository.find({
      where: { quizId },
      relations: { artist: true },
    });
    const songCount = await this.quizSongRepository.count({
      where: { quizId },
    });

    return {
      quizId: quiz.quizId,
      quizTtl: quiz.quizTtl,
      quizDesc: quiz.quizDesc,
      thumbImgUrl: quiz.thumbImgUrl,
      songCount,
      atstIds: quizArtists.map((quizArtist) => quizArtist.atstId),
      atstNms: quizArtists.map((quizArtist) => quizArtist.artist.atstNm),
    };
  }

  async incrementPlayCount(quizId: string): Promise<void> {
    await this.quizRepository.increment({ quizId }, 'playCnt', 1);
  }

  /**
   * quizId의 모든 출제곡을 quizSeq ASC 순서로, 라운드에 필요한 곡 정보+정답까지
   * 한 번에 반환한다. QUIZ_ID에 인덱스(IDX_SQ_QUIZ_SONG_01)가 있어 quizSongId
   * 목록을 먼저 조회하는 왕복 없이 이 조건 하나로 바로 조회할 수 있다. 셔플/슬라이스
   * (songLimit 반영)는 게임 서비스가 이 결과를 받아 로컬에서 수행한다.
   * 정답은 SQ_QUIZ_SONG_ANSWER에 QUIZ_ID 컬럼이 없어 quizSongId IN 절로 별도
   * 조회해야 하지만, 두 쿼리 모두 곡 수와 무관하게 항상 2회로 끝난다.
   */
  async getQuizRounds(quizId: string): Promise<QuizRoundDataDto[]> {
    const quizSongs = await this.quizSongRepository.find({
      where: { quizId },
      order: { quizSeq: 'ASC' },
      relations: { song: { artist: true, album: true } },
    });
    if (quizSongs.length === 0) {
      return [];
    }

    const quizAnswers = await this.quizAnswerRepository.find({
      where: {
        quizSongId: In(quizSongs.map((quizSong) => quizSong.quizSongId)),
      },
    });
    const answersByQuizSongId = new Map<string, string[]>();
    for (const answer of quizAnswers) {
      const list = answersByQuizSongId.get(answer.quizSongId) ?? [];
      list.push(answer.answerTxt);
      answersByQuizSongId.set(answer.quizSongId, list);
    }

    return quizSongs.map((quizSong) => ({
      quizSongId: quizSong.quizSongId,
      youtubeVideoId: quizSong.youtubeVideoId,
      startSec: quizSong.startSec,
      endSec: quizSong.endSec,
      songNm: quizSong.song.songNm,
      atstNm: quizSong.song.artist.atstNm,
      albmNm: quizSong.song.album.albmNm,
      answers: answersByQuizSongId.get(quizSong.quizSongId) ?? [],
    }));
  }
}
