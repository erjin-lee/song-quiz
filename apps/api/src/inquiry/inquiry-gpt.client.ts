import { Injectable } from '@nestjs/common';
import { asRecord, asString, getField } from '../common/unknown-object.util';
import { OpenAiChatClient } from '../openai/openai-chat.client';
import {
  buildClassifyUserMessage,
  buildVerifyUserMessage,
  CLASSIFY_SYSTEM_RULES,
  VERIFY_SYSTEM_RULES,
} from './inquiry-gpt.prompt';
import {
  INQUIRY_FUNCTION_NAMES,
  InquiryConfidence,
  InquiryFunctionName,
} from './inquiry.types';

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

function parseVerifyResult(content: string): InquiryConfidence {
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

  return confidence as InquiryConfidence;
}

@Injectable()
export class InquiryGptClient {
  constructor(private readonly openAiChatClient: OpenAiChatClient) {}

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
  ): Promise<InquiryConfidence> {
    const raw = await this.openAiChatClient.requestJson([
      { role: 'system', content: VERIFY_SYSTEM_RULES[functionName] },
      {
        role: 'user',
        content: buildVerifyUserMessage(functionName, song, content, args),
      },
    ]);
    return parseVerifyResult(raw);
  }
}
