import { Injectable, Logger } from '@nestjs/common';
import { delay } from '../common/delay';

const OPENAI_CHAT_API_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = 'gpt-5.6-luna';
const MAX_FETCH_ATTEMPTS = 3;
const FETCH_RETRY_DELAY_MS = 800;
const FETCH_TIMEOUT_MS = 60_000;

export class OpenAiChatError extends Error {}

export interface OpenAiChatMessage {
  role: 'system' | 'user';
  content: string;
}

@Injectable()
export class OpenAiChatClient {
  private readonly logger = new Logger(OpenAiChatClient.name);

  /** system/user 메시지를 보내고 JSON 형식으로 응답한 content 문자열을 반환한다. */
  async requestJson(messages: OpenAiChatMessage[]): Promise<string> {
    const apiKey = process.env.GPT_SECRET_KEY;
    if (!apiKey) {
      throw new OpenAiChatError(
        'GPT_SECRET_KEY 환경변수가 설정되지 않았습니다.',
      );
    }

    const body = JSON.stringify({
      model: OPENAI_MODEL,
      messages,
      response_format: { type: 'json_object' },
    });

    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt++) {
      try {
        const response = await fetch(OPENAI_CHAT_API_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body,
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!response.ok) {
          throw new OpenAiChatError(
            `GPT API 응답이 올바르지 않습니다. (status: ${response.status})`,
          );
        }

        const data = (await response.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const content = data.choices?.[0]?.message?.content;
        if (!content) {
          throw new OpenAiChatError('GPT 응답에 content가 없습니다.');
        }

        return content;
      } catch (error) {
        lastError = error;
        this.logger.warn(
          `GPT 요청 실패(시도 ${attempt}/${MAX_FETCH_ATTEMPTS})`,
        );
        if (attempt < MAX_FETCH_ATTEMPTS) {
          await delay(FETCH_RETRY_DELAY_MS * attempt);
        }
      }
    }

    this.logger.error('GPT 요청 최종 실패', lastError);
    throw lastError instanceof Error
      ? lastError
      : new OpenAiChatError('GPT 요청에 실패했습니다.');
  }
}
