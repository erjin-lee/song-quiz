import { Injectable } from '@nestjs/common';
import {
  internalRequestHeaders,
  throwForFailedResponse,
} from '../../common/internal-service.util';

export interface QuizSummary {
  quizId: string;
  quizTtl: string;
  quizDesc: string | null;
  thumbImgUrl: string | null;
  songCount: number;
  atstIds: string[];
  atstNms: string[];
}

export interface QuizRoundData {
  quizSongId: string;
  youtubeVideoId: string | null;
  startSec: number | null;
  endSec: number | null;
  songNm: string;
  atstNm: string;
  albmNm: string;
  answers: string[];
}

/**
 * apps/api가 소유한 Quiz 데이터를 얻기 위한 내부 HTTP 클라이언트. RoomService는
 * Quiz Repository/Entity를 직접 참조하지 않고 반드시 이 클라이언트를 거친다.
 * 게임 시작 시 필요한 라운드 데이터는 getQuizRounds로 그 퀴즈의 전체 라운드를
 * 한 번에 스냅샷으로 받아 RoomService가 셔플/슬라이스 후 Redis에 캐시해두고,
 * 라운드 진행 중에는 이 클라이언트를 다시 호출하지 않는다(원칙: 게임 시작 후
 * API 재조회 최소화).
 */
@Injectable()
export class QuizClient {
  private readonly baseUrl = (
    process.env.API_SERVICE_URL ?? 'http://localhost:8001'
  ).replace(/\/$/, '');

  async getSummary(quizId: string): Promise<QuizSummary> {
    const response = await fetch(
      `${this.baseUrl}/internal/quizzes/${quizId}/summary`,
      { headers: internalRequestHeaders() },
    );
    if (!response.ok) {
      await throwForFailedResponse(
        response,
        `퀴즈를 찾을 수 없습니다. (quizId: ${quizId})`,
      );
    }
    return response.json() as Promise<QuizSummary>;
  }

  async incrementPlayCount(quizId: string): Promise<void> {
    const response = await fetch(
      `${this.baseUrl}/internal/quizzes/${quizId}/play-count/increment`,
      { method: 'POST', headers: internalRequestHeaders() },
    );
    if (!response.ok) {
      await throwForFailedResponse(
        response,
        `퀴즈 재생 횟수 증가에 실패했습니다. (quizId: ${quizId})`,
      );
    }
  }

  /**
   * quizId의 전체 출제곡을 quizSeq ASC 순서로, 라운드에 필요한 곡 정보+정답까지
   * 한 번에 반환한다. 셔플/슬라이스(songLimit 반영)는 이 결과를 받아 RoomService가
   * 로컬에서 수행한다.
   */
  async getQuizRounds(quizId: string): Promise<QuizRoundData[]> {
    const response = await fetch(
      `${this.baseUrl}/internal/quizzes/${quizId}/rounds`,
      { headers: internalRequestHeaders() },
    );
    if (!response.ok) {
      await throwForFailedResponse(
        response,
        `퀴즈 출제곡 정보를 조회하지 못했습니다. (quizId: ${quizId})`,
      );
    }
    return response.json() as Promise<QuizRoundData[]>;
  }
}
