import '../scraper/node-fetch-polyfill';
import { Injectable, Logger } from '@nestjs/common';

const YOUTUBE_BASE_URL = 'https://www.youtube.com';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const YT_INITIAL_DATA_MARKER = 'var ytInitialData = ';
const MAX_FETCH_ATTEMPTS = 3;
const FETCH_RETRY_DELAY_MS = 1300;
const FETCH_TIMEOUT_MS = 10_000;
const LENGTH_SECONDS_PATTERN = /"lengthSeconds":"(\d+)"/;

export interface YoutubeSearchResult {
  videoId: string;
  durationSec: number;
}

export class YoutubeFetchError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseDurationText(text: string): number | null {
  const parts = text.split(':').map((part) => Number(part));
  if (parts.length === 0 || parts.some((part) => Number.isNaN(part))) {
    return null;
  }
  return parts.reduce((acc, part) => acc * 60 + part, 0);
}

function extractYtInitialData(html: string): unknown {
  const markerIndex = html.indexOf(YT_INITIAL_DATA_MARKER);
  if (markerIndex === -1) {
    return null;
  }

  const jsonStart = markerIndex + YT_INITIAL_DATA_MARKER.length;
  if (html[jsonStart] !== '{') {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  let jsonEnd = -1;

  for (let i = jsonStart; i < html.length; i++) {
    const char = html[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0) {
        jsonEnd = i;
        break;
      }
    }
  }

  if (jsonEnd === -1) {
    return null;
  }

  try {
    return JSON.parse(html.slice(jsonStart, jsonEnd + 1));
  } catch {
    return null;
  }
}

function findFirstValidVideo(node: unknown): YoutubeSearchResult | null {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findFirstValidVideo(item);
      if (found) {
        return found;
      }
    }
    return null;
  }

  if (!isRecord(node)) {
    return null;
  }

  const renderer = node.videoRenderer;
  if (isRecord(renderer)) {
    const videoId = renderer.videoId;
    const lengthText = renderer.lengthText;
    const simpleText = isRecord(lengthText) ? lengthText.simpleText : undefined;
    if (typeof videoId === 'string' && typeof simpleText === 'string') {
      const durationSec = parseDurationText(simpleText);
      if (durationSec !== null) {
        return { videoId, durationSec };
      }
    }
  }

  for (const value of Object.values(node)) {
    const found = findFirstValidVideo(value);
    if (found) {
      return found;
    }
  }
  return null;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable()
export class YoutubeScraperClient {
  private readonly logger = new Logger(YoutubeScraperClient.name);

  async search(
    query: string,
    logContext?: string,
  ): Promise<YoutubeSearchResult | null> {
    const url = `${YOUTUBE_BASE_URL}/results?search_query=${encodeURIComponent(query)}`;
    const html = await this.getHtml(url, logContext);
    const data = extractYtInitialData(html);
    if (!data) {
      return null;
    }
    return findFirstValidVideo(data);
  }

  /** 특정 videoId의 재생 페이지를 조회해 영상 길이(초)를 반환한다. 실패 시 null. */
  async getDurationSec(
    videoId: string,
    logContext?: string,
  ): Promise<number | null> {
    const html = await this.getHtml(
      `${YOUTUBE_BASE_URL}/watch?v=${videoId}`,
      logContext,
    );
    const match = html.match(LENGTH_SECONDS_PATTERN);
    if (!match) {
      return null;
    }
    const seconds = Number(match[1]);
    return Number.isFinite(seconds) ? seconds : null;
  }

  private async getHtml(url: string, logContext?: string): Promise<string> {
    let lastError: unknown;
    const logSuffix = logContext ? ` (${logContext})` : '';

    for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt++) {
      try {
        const response = await fetch(url, {
          redirect: 'manual',
          headers: {
            'User-Agent': USER_AGENT,
            'Accept-Language': 'ko-KR,ko;q=0.9',
          },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!response.ok) {
          throw new YoutubeFetchError(
            `유튜브 페이지 응답이 올바르지 않습니다. (status: ${response.status}, url: ${url})`,
          );
        }
        return await response.text();
      } catch (error) {
        lastError = error;
        this.logger.warn(
          `유튜브 요청 실패(시도 ${attempt}/${MAX_FETCH_ATTEMPTS}): ${url}${logSuffix}`,
        );
        if (attempt < MAX_FETCH_ATTEMPTS) {
          await delay(FETCH_RETRY_DELAY_MS * attempt);
        }
      }
    }

    this.logger.error(`유튜브 요청 최종 실패: ${url}${logSuffix}`, lastError);
    throw lastError instanceof Error
      ? lastError
      : new YoutubeFetchError(
          `유튜브 페이지 요청에 실패했습니다. (url: ${url})`,
        );
  }
}
