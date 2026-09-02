import { Injectable, Logger } from '@nestjs/common';
import { YoutubeScraperClient } from '../quiz/youtube-scraper.client';
import {
  asBoolean,
  asRecord,
  asString,
  getField,
} from '../common/unknown-object.util';
import {
  OpenAiChatClient,
  OpenAiChatMessage,
} from '../openai/openai-chat.client';
import {
  buildChangeLinkFallbackUserMessage,
  buildClassifyUserMessage,
  buildVerifyUserMessage,
  CHANGE_LINK_FALLBACK_SYSTEM_RULES,
  CLASSIFY_SYSTEM_RULES,
  VERIFY_SYSTEM_RULES,
} from './inquiry-gpt.prompt';
import {
  INQUIRY_FUNCTION_NAMES,
  InquiryConfidence,
  InquiryFunctionName,
} from './inquiry.types';
import { parseYoutubeUrl } from '../common/youtube-url.util';

const CONFIDENCE_VALUES: InquiryConfidence[] = ['LOW', 'MEDIUM', 'HIGH'];

export class InquiryGptError extends Error {}

export interface InquirySongContext {
  quizSongId: string;
  songNm: string;
  atstNm: string;
  startSec: number;
  youtubeUrl: string;
  durationSec: number | null;
}

export interface InquiryClassifyResult {
  matchedFunction: InquiryFunctionName | null;
  args: Record<string, unknown> | null;
}

export interface InquiryVerifyResult {
  confidence: InquiryConfidence;
  /** GPT가 밝힌 판단 근거. 프롬프트가 지켜지지 않아 응답에 없으면 빈 문자열로 폴백한다. */
  reason: string;
  /**
   * CHANGE_LINK 1차 검증(웹 검색)에서만 채워진다 - 웹 검색으로 새 링크의 실제 내용을
   * 확인했는지 여부. false면 스크래핑 정보로 2차 검증을 시도한다. 그 외 함수/2차
   * 검증 결과에는 없다(undefined).
   */
  linkAccessible?: boolean;
}

function parseClassifyResult(content: string): InquiryClassifyResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new InquiryGptError(`GPT 응답이 JSON 형식이 아닙니다: ${content}`);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new InquiryGptError(`GPT 응답 형식이 올바르지 않습니다: ${content}`);
  }

  const matchedFunction = getField(parsed, 'matchedFunction');
  if (matchedFunction === null) {
    return { matchedFunction: null, args: null };
  }
  if (
    typeof matchedFunction !== 'string' ||
    !INQUIRY_FUNCTION_NAMES.includes(matchedFunction as InquiryFunctionName)
  ) {
    return { matchedFunction: null, args: null };
  }

  const args = asRecord(parsed, 'args');
  if (!args) {
    return { matchedFunction: null, args: null };
  }

  return {
    matchedFunction: matchedFunction as InquiryFunctionName,
    args,
  };
}

function parseVerifyResult(content: string): InquiryVerifyResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new InquiryGptError(`GPT 응답이 JSON 형식이 아닙니다: ${content}`);
  }

  const confidence = asString(parsed, 'confidence');
  if (
    !confidence ||
    !CONFIDENCE_VALUES.includes(confidence as InquiryConfidence)
  ) {
    throw new InquiryGptError(
      `GPT 응답에 유효한 confidence가 없습니다: ${content}`,
    );
  }

  const reason = asString(parsed, 'reason');
  const linkAccessible = asBoolean(parsed, 'linkAccessible');
  return {
    confidence: confidence as InquiryConfidence,
    reason: reason ?? '',
    ...(linkAccessible !== undefined ? { linkAccessible } : {}),
  };
}

@Injectable()
export class InquiryGptClient {
  private readonly logger = new Logger(InquiryGptClient.name);

  constructor(
    private readonly openAiChatClient: OpenAiChatClient,
    private readonly youtubeScraperClient: YoutubeScraperClient,
  ) {}

  async classify(
    song: InquirySongContext,
    content: string,
  ): Promise<InquiryClassifyResult> {
    const raw = await this.openAiChatClient.requestJson([
      { role: 'system', content: CLASSIFY_SYSTEM_RULES },
      { role: 'user', content: buildClassifyUserMessage(song, content) },
    ]);
    return parseClassifyResult(raw);
  }

  async verifyConfidence(
    functionName: InquiryFunctionName,
    song: InquirySongContext,
    content: string,
    args: Record<string, unknown>,
  ): Promise<InquiryVerifyResult> {
    const messages: OpenAiChatMessage[] = [
      { role: 'system', content: VERIFY_SYSTEM_RULES[functionName] },
      {
        role: 'user',
        content: buildVerifyUserMessage(functionName, song, content, args),
      },
    ];
    // CHANGE_LINK 검증 규칙은 기존/새 유튜브 링크를 실제로 확인하도록
    // 요구하므로, 이 경우에만 웹 검색 도구를 켠다.
    if (functionName !== 'CHANGE_LINK') {
      const raw = await this.openAiChatClient.requestJson(messages);
      return parseVerifyResult(raw);
    }

    const raw = await this.openAiChatClient.requestJson(messages, {
      webSearch: true,
    });
    const result = parseVerifyResult(raw);
    if (result.linkAccessible !== false) {
      return result;
    }

    // linkAccessible: false는 "웹 검색으로 실제 내용을 확인하지 못했다"는 뜻이므로,
    // 이 시점부터는 confidence를 신뢰할 수 없다 - 프롬프트를 어기고 HIGH를 함께
    // 반환했더라도(예: { confidence: "HIGH", linkAccessible: false}) 여기서 먼저
    // MEDIUM으로 낮춰서, 이후 스크래핑/2차 요청이 실패해 이 값을 그대로 쓰게 되는
    // 모든 경로에서 검증되지 않은 HIGH가 새어나가지 않게 한다.
    const cappedPrimaryResult: InquiryVerifyResult =
      result.confidence === 'HIGH'
        ? { ...result, confidence: 'MEDIUM' }
        : result;

    // 웹 검색으로 새 링크에 접근하지 못했을 때만, 우리가 직접 스크래핑한 정보를
    // 근거로 재판단한다(별도 웹 검색 재시도는 하지 않는다).
    return this.verifyChangeLinkWithScrapedFallback(
      song,
      content,
      args,
      cappedPrimaryResult,
    );
  }

  private async verifyChangeLinkWithScrapedFallback(
    song: InquirySongContext,
    content: string,
    args: Record<string, unknown>,
    primaryResult: InquiryVerifyResult,
  ): Promise<InquiryVerifyResult> {
    const scraped = await this.scrapeNewLinkInfo(
      String(args.youtubeUrl),
      song.quizSongId,
    );
    if (!scraped) {
      return primaryResult;
    }

    try {
      const raw = await this.openAiChatClient.requestJson([
        { role: 'system', content: CHANGE_LINK_FALLBACK_SYSTEM_RULES },
        {
          role: 'user',
          content: buildChangeLinkFallbackUserMessage(
            song,
            content,
            args,
            scraped,
          ),
        },
      ]);
      const result = parseVerifyResult(raw);
      // 실제 페이지 접근 없이 제목 텍스트만으로 판단한 결과라 조작 가능성이 있다
      // (영상 제목은 업로더가 임의로 정할 수 있다) - 프롬프트가 지켜지지 않아도
      // 코드에서 한 번 더 HIGH를 막아 반드시 관리자 검토(MEDIUM 이하)로 보낸다.
      return result.confidence === 'HIGH'
        ? { ...result, confidence: 'MEDIUM' }
        : result;
    } catch (error) {
      this.logger.warn(
        `CHANGE_LINK 검증 폴백(스크래핑 정보 기반 재판단) 실패(quizSongId: ${song.quizSongId})`,
        error,
      );
      return primaryResult;
    }
  }

  private async scrapeNewLinkInfo(
    youtubeUrl: string,
    quizSongId: string,
  ): Promise<{ title: string | null; durationSec: number | null } | null> {
    const { videoId } = parseYoutubeUrl(youtubeUrl);
    if (!videoId) {
      return null;
    }
    try {
      return await this.youtubeScraperClient.getVideoInfo(
        videoId,
        `quizSongId: ${quizSongId} (CHANGE_LINK 검증 폴백)`,
      );
    } catch (error) {
      this.logger.warn(
        `CHANGE_LINK 검증 폴백용 스크래핑 실패(quizSongId: ${quizSongId})`,
        error,
      );
      return null;
    }
  }
}
