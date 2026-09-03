import { Injectable, Logger } from '@nestjs/common';
import {
  buildYoutubeWatchUrl,
  parseYoutubeUrl,
} from '../common/youtube-url.util';
import {
  stripFeatAnnotations,
  toComparableText,
} from './song-title-normalizer';
import { YoutubeScraperClient } from './youtube-scraper.client';

/** 기존 자동 생성 플로우(quiz-generator.service.ts)와 동일한 클립 길이. */
const QUIZ_SONG_CLIP_SEC = 30;

export interface YoutubeLinkValidationResult {
  valid: boolean;
  youtubeUrl: string | null;
  youtubeVideoId: string | null;
  durationSec: number | null;
  startSec: number | null;
  endSec: number | null;
  reason: string | null;
}

export interface YoutubeLinkValidationOptions {
  /**
   * 제목 매칭(콘텐츠 검증)을 생략할지. 반드시 서버가 검증한 값(예:
   * link-verification-token.util.ts로 서명된 토큰 검증 결과)에서만 계산해서
   * 넘겨야 한다 - 클라이언트가 이 값을 직접 통제할 수 있게 하면 조작된
   * songNm/링크로도 검증을 우회할 수 있다.
   */
  skipContentCheck?: boolean;
}

function invalid(
  reason: string,
  durationSec: number | null = null,
): YoutubeLinkValidationResult {
  return {
    valid: false,
    youtubeUrl: null,
    youtubeVideoId: null,
    durationSec,
    startSec: null,
    endSec: null,
    reason,
  };
}

/**
 * 유저가 직접 입력한 유튜브 링크를 검증한다(docs/features/user-quiz-registration/spec.md
 * 3.3). ADR-0009 원칙에 따라 호스트/경로/videoId를 먼저 검증하고, 실제로
 * 스크래핑한 영상 제목에 곡 제목이 포함되는지까지 확인해야 통과시킨다.
 */
@Injectable()
export class YoutubeLinkValidationService {
  private readonly logger = new Logger(YoutubeLinkValidationService.name);

  constructor(private readonly youtubeScraperClient: YoutubeScraperClient) {}

  /**
   * 형식(ADR-0009)은 항상 검증한다. 콘텐츠(영상 제목-곡 제목 대조)는
   * options.skipContentCheck가 true일 때만 생략한다 - 자동 검색(스펙 3.3-③)
   * 결과처럼 신뢰도가 높은 조합만 예외를 받아야 하고, 그 판단은 반드시
   * link-verification-token.util.ts로 서명 검증된 값에서만 나와야 한다.
   * 예전에는 이 예외를 클라이언트가 보내는 플래그로 판단한 적이 있었는데,
   * 그 플래그 자체가 클라이언트 입력이라 임의로 콘텐츠 검증을 우회하는 데
   * 악용될 수 있었다(코드 리뷰 지적으로 토큰 검증 방식으로 대체).
   */
  async validate(
    rawUrl: string,
    songNm: string,
    options: YoutubeLinkValidationOptions = {},
  ): Promise<YoutubeLinkValidationResult> {
    const { videoId, startSec: requestedStartSec } = parseYoutubeUrl(rawUrl);
    if (!videoId) {
      return invalid('유튜브 영상 링크 형식이 올바르지 않습니다.');
    }

    const videoInfo = await this.youtubeScraperClient
      .getVideoInfo(videoId)
      .catch((error) => {
        this.logger.warn(
          `유튜브 영상 정보 조회 실패(videoId: ${videoId})`,
          error,
        );
        return null;
      });
    if (!videoInfo || !videoInfo.title) {
      return invalid(
        '영상 정보를 확인할 수 없습니다.',
        videoInfo?.durationSec ?? null,
      );
    }

    if (!options.skipContentCheck) {
      const comparableSongTitle = toComparableText(
        stripFeatAnnotations(songNm),
      );
      const comparableVideoTitle = toComparableText(videoInfo.title);
      if (
        !comparableSongTitle ||
        !comparableVideoTitle.includes(comparableSongTitle)
      ) {
        return invalid(
          '영상 제목에 곡 제목이 포함되어 있지 않습니다.',
          videoInfo.durationSec,
        );
      }
    }

    const { startSec, endSec } = this.resolveClipRange(
      requestedStartSec,
      videoInfo.durationSec,
    );

    return {
      valid: true,
      youtubeUrl: buildYoutubeWatchUrl(videoId, startSec),
      youtubeVideoId: videoId,
      durationSec: videoInfo.durationSec,
      startSec,
      endSec,
      reason: null,
    };
  }

  /**
   * 유저가 t= 파라미터로 넘긴 시작 지점이 있고 영상 안에 30초 클립이 들어가면
   * 그대로 쓰고, 아니면 기존 자동 생성 로직과 동일하게 영상 길이의 절반 지점을
   * 기본값으로 쓴다(길이를 못 구했으면 0).
   */
  private resolveClipRange(
    requestedStartSec: number | null,
    durationSec: number | null,
  ): { startSec: number; endSec: number } {
    const maxStartSec =
      durationSec !== null
        ? Math.max(0, durationSec - QUIZ_SONG_CLIP_SEC)
        : null;

    let startSec = 0;
    if (
      requestedStartSec !== null &&
      (maxStartSec === null || requestedStartSec <= maxStartSec)
    ) {
      startSec = requestedStartSec;
    } else if (durationSec !== null) {
      startSec = Math.min(Math.round(durationSec / 2), maxStartSec ?? 0);
    }

    return { startSec, endSec: startSec + QUIZ_SONG_CLIP_SEC };
  }
}
