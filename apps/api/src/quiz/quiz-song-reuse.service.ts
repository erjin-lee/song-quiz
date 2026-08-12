import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { QuizAnswer } from './entities/quiz-answer.entity';
import { QuizSong } from './entities/quiz-song.entity';

/**
 * 동일한 곡을 다른 퀴즈에서 이미 출제한 적이 있다면 그 유튜브 정보/정답을
 * 재사용하기 위한 조회·복사 로직. 차트 스크래핑, 유튜브 링크 채우기 등
 * 새 퀴즈 출제곡을 만드는 여러 흐름에서 공통으로 사용한다.
 */
@Injectable()
export class QuizSongReuseService {
  constructor(
    @InjectRepository(QuizSong)
    private readonly quizSongRepository: Repository<QuizSong>,
    @InjectRepository(QuizAnswer)
    private readonly quizAnswerRepository: Repository<QuizAnswer>,
  ) {}

  /** 동일한 곡을 다른 퀴즈에서 이미 출제한 적이 있다면 그 유튜브 정보를 재사용한다. */
  async findReusableYoutubeInfo(songId: string): Promise<QuizSong | null> {
    return this.quizSongRepository.findOne({
      where: { songId, youtubeUrl: Not('') },
      order: { updDt: 'DESC' },
    });
  }

  /**
   * 동일한 곡을 출제한 다른 퀴즈 출제곡 중 정답이 저장된 것이 있으면
   * 가장 최근 것을 골라 그 정답 목록을 새 퀴즈 출제곡에 복사한다.
   */
  async copyReusableAnswers(
    songId: string,
    targetQuizSongId: string,
  ): Promise<number> {
    const candidateQuizSongs = await this.quizSongRepository.find({
      where: { songId },
      order: { updDt: 'DESC' },
    });

    for (const candidate of candidateQuizSongs) {
      if (candidate.quizSongId === targetQuizSongId) {
        continue;
      }
      const sourceAnswers = await this.quizAnswerRepository.find({
        where: { quizSongId: candidate.quizSongId },
      });
      if (sourceAnswers.length === 0) {
        continue;
      }

      await this.quizAnswerRepository.save(
        sourceAnswers.map((answer) =>
          this.quizAnswerRepository.create({
            quizSongId: targetQuizSongId,
            answerTxt: answer.answerTxt,
            answerType: answer.answerType,
            confidence: answer.confidence,
            isActive: answer.isActive,
          }),
        ),
      );
      return sourceAnswers.length;
    }
    return 0;
  }
}
