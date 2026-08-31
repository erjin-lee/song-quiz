import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { withStartSecParam } from 'shared';
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
import { parseYoutubeUrl } from './youtube-url.util';

const MAX_ANSWER_TYPE_LENGTH = 12;
/** 시작 시간 변경/링크 교체 시 종료 시간을 맞추는 클립 길이(초). quiz-generator.service.ts의 QUIZ_SONG_CLIP_SEC과 동일하게 맞춘다. */
const QUIZ_SONG_CLIP_SEC = 30;

export interface InquiryActionSnapshot {
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

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
  ): Promise<InquiryActionSnapshot> {
    const quizSong = await this.findQuizSongOrThrow(quizSongId);
    const before = {
      startSec: quizSong.startSec,
      youtubeUrl: quizSong.youtubeUrl,
    };

    quizSong.startSec = args.startSec;
    quizSong.endSec = args.startSec + QUIZ_SONG_CLIP_SEC;
    quizSong.youtubeUrl = withStartSecParam(quizSong.youtubeUrl, args.startSec);
    await this.quizSongRepository.save(quizSong);

    return {
      before,
      after: { startSec: quizSong.startSec, youtubeUrl: quizSong.youtubeUrl },
    };
  }

  /**
   * 새 링크의 영상 길이를 스크래핑해 DURATION을 갱신한다. 새 링크에 t 파라미터가
   * 있으면 그 값을 시작 시간으로, 없으면 스크래핑한 재생시간의 절반을 시작 시간으로
   * 쓴다. 종료 시간은 시작 시간 + QUIZ_SONG_CLIP_SEC으로 고정한다
   * (quiz-generator.service.ts와 동일한 클립 길이).
   */
  async changeLink(
    quizSongId: string,
    args: ChangeLinkArgs,
  ): Promise<InquiryActionSnapshot> {
    const quizSong = await this.findQuizSongOrThrow(quizSongId);
    const before = {
      youtubeUrl: quizSong.youtubeUrl,
      startSec: quizSong.startSec,
      durationSec: quizSong.durationSec,
    };
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

    return {
      before,
      after: {
        youtubeUrl: quizSong.youtubeUrl,
        startSec: quizSong.startSec,
        durationSec: quizSong.durationSec,
      },
    };
  }

  /**
   * 정답을 추가한다. INSERT라 재실행 시 중복 삽입되므로(CHANGE_START_TIME/CHANGE_LINK와
   * 달리 멱등적이지 않다 - ADR-0008), 실행 전 같은 quizSongId+answerTxt로 이미 활성화된
   * 정답이 있는지 먼저 확인해 있으면 새로 넣지 않고 건너뛴다. "실제 조치는 성공했는데
   * 이후 상태 기록만 실패해 재승인되는" 경우에도 이 확인 덕분에 안전하게 재시도된다.
   */
  async addAnswer(
    quizSongId: string,
    args: AddAnswerArgs,
    confidence: InquiryConfidence,
  ): Promise<InquiryActionSnapshot> {
    const answerType =
      args.answerType?.slice(0, MAX_ANSWER_TYPE_LENGTH) ?? null;

    const existing = await this.quizAnswerRepository.findOne({
      where: { quizSongId, answerTxt: args.answerTxt, isActive: 'Y' },
    });
    if (existing) {
      return {
        before: {
          answerTxt: existing.answerTxt,
          answerType: existing.answerType,
        },
        after: {
          answerTxt: existing.answerTxt,
          answerType: existing.answerType,
        },
      };
    }

    const quizAnswer = this.quizAnswerRepository.create({
      quizSongId,
      answerTxt: args.answerTxt,
      answerType,
      confidence,
      isActive: 'Y',
    });
    await this.quizAnswerRepository.save(quizAnswer);

    return {
      before: {},
      after: { answerTxt: args.answerTxt, answerType },
    };
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
