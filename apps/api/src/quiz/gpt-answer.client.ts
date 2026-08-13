import { Injectable } from '@nestjs/common';
import { asArray, asString } from '../common/unknown-object.util';
import { OpenAiChatClient } from '../openai/openai-chat.client';
import {
  buildGptAnswerUserMessage,
  GPT_ANSWER_SYSTEM_RULES,
} from './gpt-answer.prompt';

const MAX_ANSWER_LENGTH = 300;
const MAX_ANSWER_TYPE_LENGTH = 12;
const MAX_CONFIDENCE_LENGTH = 8;

export class GptFetchError extends Error {}

export interface GptSongInput {
  quizSongId: string;
  songNm: string;
  atstNm: string;
}

export interface GptAnswerCandidate {
  answerTxt: string;
  answerType: string | null;
  confidence: string | null;
}

function parseAnswerCandidate(raw: unknown): GptAnswerCandidate | null {
  const answerTxt = asString(raw, 'answerTxt')?.trim();
  if (!answerTxt || answerTxt.length > MAX_ANSWER_LENGTH) {
    return null;
  }

  const type = asString(raw, 'type')?.trim();
  const confidence = asString(raw, 'confidence')?.trim();

  return {
    answerTxt,
    answerType: type ? type.slice(0, MAX_ANSWER_TYPE_LENGTH) : null,
    confidence: confidence ? confidence.slice(0, MAX_CONFIDENCE_LENGTH) : null,
  };
}

function parseBatchAnswers(
  content: string,
  requestedIds: Set<string>,
): Map<string, GptAnswerCandidate[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new GptFetchError(`GPT 응답이 JSON 형식이 아닙니다: ${content}`);
  }

  const results = asArray(parsed, 'results');
  if (!results) {
    throw new GptFetchError(`GPT 응답에 results 배열이 없습니다: ${content}`);
  }

  const answersByQuizSongId = new Map<string, GptAnswerCandidate[]>();
  for (const item of results) {
    const quizSongId = asString(item, 'quizSongId');
    const rawAnswers = asArray(item, 'answers');
    if (!quizSongId || !requestedIds.has(quizSongId) || !rawAnswers) {
      continue;
    }

    const seenTxt = new Set<string>();
    const candidates: GptAnswerCandidate[] = [];
    for (const rawAnswer of rawAnswers) {
      const candidate = parseAnswerCandidate(rawAnswer);
      if (!candidate || seenTxt.has(candidate.answerTxt)) {
        continue;
      }
      seenTxt.add(candidate.answerTxt);
      candidates.push(candidate);
    }

    if (candidates.length > 0) {
      answersByQuizSongId.set(quizSongId, candidates);
    }
  }

  return answersByQuizSongId;
}

@Injectable()
export class GptAnswerClient {
  constructor(private readonly openAiChatClient: OpenAiChatClient) {}

  async generateAnswersBatch(
    songs: GptSongInput[],
  ): Promise<Map<string, GptAnswerCandidate[]>> {
    if (songs.length === 0) {
      return new Map();
    }

    const requestedIds = new Set(songs.map((song) => song.quizSongId));
    const content = await this.openAiChatClient.requestJson([
      { role: 'system', content: GPT_ANSWER_SYSTEM_RULES },
      { role: 'user', content: buildGptAnswerUserMessage(songs) },
    ]);

    return parseBatchAnswers(content, requestedIds);
  }
}
