import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';

export const OPENAI_MODEL = 'gpt-5.6-luna';
const MAX_RETRIES = 2;
const REQUEST_TIMEOUT_MS = 60_000;

export class OpenAiChatError extends Error {}

export interface OpenAiChatMessage {
  role: 'system' | 'user';
  content: string;
}

export interface OpenAiChatRequestOptions {
  /** CHANGE_LINK 검증처럼 모델이 실제 웹 페이지를 확인해야 하는 요청에만 켠다. */
  webSearch?: boolean;
}

@Injectable()
export class OpenAiChatClient {
  private readonly logger = new Logger(OpenAiChatClient.name);
  private client: OpenAI | null = null;

  /**
   * system/user 메시지를 Responses API로 보내고 JSON 형식으로 응답한 텍스트를
   * 반환한다. `webSearch: true`를 주면 모델이 응답 생성 중 OpenAI 호스팅
   * 웹 검색 도구를 사용할 수 있다(예: 새 유튜브 링크가 실제로 유효한지 확인).
   * 이 경우 강제 JSON 모드는 함께 쓸 수 없어 프롬프트의 출력 형식 지시에만
   * 의존하므로, 호출부는 JSON 파싱 실패 가능성을 반드시 처리해야 한다.
   */
  async requestJson(
    messages: OpenAiChatMessage[],
    options: OpenAiChatRequestOptions = {},
  ): Promise<string> {
    try {
      const response = await this.getClient().responses.create({
        model: OPENAI_MODEL,
        input: messages,
        // OpenAI는 web_search 도구와 강제 JSON 모드(text.format: json_object)를
        // 함께 쓰는 것을 허용하지 않는다("Web Search cannot be used with JSON
        // mode"). 웹 검색이 필요한 요청은 강제 JSON 모드 없이 프롬프트의 출력
        // 형식 지시만으로 받고, 형식이 어긋나면 호출부의 JSON 파싱에서 걸러진다.
        ...(options.webSearch
          ? { tools: [{ type: 'web_search' }] }
          : { text: { format: { type: 'json_object' } } }),
      });

      const content = response.output_text;
      if (!content) {
        throw new OpenAiChatError('GPT 응답에 content가 없습니다.');
      }
      return content;
    } catch (error) {
      this.logger.error('GPT 요청 최종 실패', error);
      throw error instanceof Error
        ? error
        : new OpenAiChatError('GPT 요청에 실패했습니다.');
    }
  }

  /**
   * 재시도/타임아웃은 openai SDK가 내장 로직(네트워크 오류·408/409/429/5xx에
   * 한해 지수 백오프로 최대 MAX_RETRIES회 재시도)으로 처리하므로 직접
   * 구현하지 않는다.
   */
  private getClient(): OpenAI {
    if (!this.client) {
      const apiKey = process.env.GPT_SECRET_KEY;
      if (!apiKey) {
        throw new OpenAiChatError(
          'GPT_SECRET_KEY 환경변수가 설정되지 않았습니다.',
        );
      }
      this.client = new OpenAI({
        apiKey,
        timeout: REQUEST_TIMEOUT_MS,
        maxRetries: MAX_RETRIES,
      });
    }
    return this.client;
  }
}
