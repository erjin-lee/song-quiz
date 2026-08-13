import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QuizAnswer } from '../quiz/entities/quiz-answer.entity';
import { QuizSong } from '../quiz/entities/quiz-song.entity';
import { YoutubeScraperClient } from '../quiz/youtube-scraper.client';
import {
  AddAnswerArgs,
  ChangeLinkArgs,
  ChangeStartTimeArgs,
  InquiryConfidence,
} from './inquiry.types';
import { parseYoutubeUrl, withStartSecParam } from './youtube-url.util';

const MAX_ANSWER_TYPE_LENGTH = 12;
/** 링크 교체 시 t 파라미터가 없어 재생시간을 스크래핑으로 추정할 때 쓰는 클립 길이(초). quiz-generator.service.ts의 QUIZ_SONG_CLIP_SEC과 동일하게 맞춘다. */
const QUIZ_SONG_CLIP_SEC = 30;

@Injectable()
export class InquiryActionService {
  constructor(
    @InjectRepository(QuizSong)
    private readonly quizSongRepository: Repository<QuizSong>,
    @InjectRepository(QuizAnswer)
    private readonly quizAnswerRepository: Repository<QuizAnswer>,
    private readonly youtubeScraperClient: YoutubeScraperClient,
  ) {}

  /** 시작 시간뿐 아니라 링크의 t 파라미터도 새 값으로 맞춘다. */
  async changeStartTime(
    quizSongId: string,
    args: ChangeStartTimeArgs,
  ): Promise<void> {
    const quizSong = await this.findQuizSongOrThrow(quizSongId);
    quizSong.startSec = args.startSec;
    quizSong.youtubeUrl = withStartSecParam(quizSong.youtubeUrl, args.startSec);
    await this.quizSongRepository.save(quizSong);
  }

  /**
   * 새 링크의 영상 길이를 스크래핑해 DURATION을 갱신한다. 새 링크에 t 파라미터가
   * 있으면 그 값을 시작 시간으로, 없으면 스크래핑한 재생시간의 절반을 시작 시간으로
   * 쓴다. 종료 시간은 시작 시간 + QUIZ_SONG_CLIP_SEC으로 고정한다
   * (quiz-generator.service.ts와 동일한 클립 길이).
   */
  async changeLink(quizSongId: string, args: ChangeLinkArgs): Promise<void> {
    const quizSong = await this.findQuizSongOrThrow(quizSongId);
    const { videoId, startSec: startSecFromUrl } = parseYoutubeUrl(
      args.youtubeUrl,
    );

    const durationSec = videoId
      ? await this.youtubeScraperClient.getDurationSec(
          videoId,
          `quizSongId: ${quizSongId}`,
        )
      : null;

    const startSec =
      startSecFromUrl ??
      (durationSec !== null ? Math.round(durationSec / 2) : null) ??
      quizSong.startSec;

    quizSong.youtubeUrl = args.youtubeUrl;
    quizSong.youtubeVideoId = videoId;
    quizSong.durationSec = durationSec;
    quizSong.startSec = startSec;
    quizSong.endSec = startSec + QUIZ_SONG_CLIP_SEC;
    await this.quizSongRepository.save(quizSong);
  }

  async addAnswer(
    quizSongId: string,
    args: AddAnswerArgs,
    confidence: InquiryConfidence,
  ): Promise<void> {
    const quizAnswer = this.quizAnswerRepository.create({
      quizSongId,
      answerTxt: args.answerTxt,
      answerType: args.answerType?.slice(0, MAX_ANSWER_TYPE_LENGTH) ?? null,
      confidence,
      isActive: 'Y',
    });
    await this.quizAnswerRepository.save(quizAnswer);
  }

  private async findQuizSongOrThrow(quizSongId: string): Promise<QuizSong> {
    const quizSong = await this.quizSongRepository.findOne({
      where: { quizSongId },
    });
    if (!quizSong) {
      throw new NotFoundException(
        `출제곡을 찾을 수 없습니다. (quizSongId: ${quizSongId})`,
      );
    }
    return quizSong;
  }
}
