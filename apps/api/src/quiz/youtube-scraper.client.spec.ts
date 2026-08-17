import { Logger } from '@nestjs/common';
import {
  YoutubeFetchError,
  YoutubeScraperClient,
} from './youtube-scraper.client';

function fakeResponse(
  body: string,
  init?: { ok?: boolean; status?: number },
): Response {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    text: () => Promise.resolve(body),
  } as Response;
}

function ytInitialDataHtml(data: unknown): string {
  return `<html><script>var ytInitialData = ${JSON.stringify(data)};</script></html>`;
}

describe('YoutubeScraperClient', () => {
  let client: YoutubeScraperClient;
  let fetchSpy: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    client = new YoutubeScraperClient();
    fetchSpy = jest.spyOn(globalThis, 'fetch');
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('search', () => {
    it('첫 번째로 발견되는 유효한 videoRenderer를 반환한다', async () => {
      fetchSpy.mockResolvedValueOnce(
        fakeResponse(
          ytInitialDataHtml({
            contents: {
              items: [
                { channelRenderer: { channelId: 'irrelevant' } },
                {
                  videoRenderer: {
                    videoId: 'vid1',
                    lengthText: { simpleText: '3:45' },
                  },
                },
              ],
            },
          }),
        ),
      );

      const result = await client.search('아이유 - 좋은 날');

      expect(result).toEqual({ videoId: 'vid1', durationSec: 225 });
    });

    it('길이 정보(lengthText)가 없는 영상(예: 라이브)은 건너뛰고 다음 유효한 영상을 반환한다', async () => {
      fetchSpy.mockResolvedValueOnce(
        fakeResponse(
          ytInitialDataHtml({
            items: [
              { videoRenderer: { videoId: 'live1', lengthText: {} } },
              {
                videoRenderer: {
                  videoId: 'vid2',
                  lengthText: { simpleText: '1:02:03' },
                },
              },
            ],
          }),
        ),
      );

      const result = await client.search('검색어');

      expect(result).toEqual({ videoId: 'vid2', durationSec: 3723 });
    });

    it('ytInitialData 마커가 없으면 null을 반환한다', async () => {
      fetchSpy.mockResolvedValueOnce(fakeResponse('<html>결과 없음</html>'));

      const result = await client.search('검색어');

      expect(result).toBeNull();
    });

    it('유효한 videoRenderer가 없으면 null을 반환한다', async () => {
      fetchSpy.mockResolvedValueOnce(
        fakeResponse(ytInitialDataHtml({ items: [{ channelRenderer: {} }] })),
      );

      const result = await client.search('검색어');

      expect(result).toBeNull();
    });
  });

  describe('getDurationSec', () => {
    it('lengthSeconds 값을 파싱한다', async () => {
      fetchSpy.mockResolvedValueOnce(
        fakeResponse('...leabc"lengthSeconds":"245","other":"x"...'),
      );

      const result = await client.getDurationSec('vid1');

      expect(result).toBe(245);
    });

    it('lengthSeconds 패턴이 없으면 null을 반환한다', async () => {
      fetchSpy.mockResolvedValueOnce(fakeResponse('<html>내용 없음</html>'));

      const result = await client.getDurationSec('vid1');

      expect(result).toBeNull();
    });
  });

  describe('getHtml 재시도/오류 처리', () => {
    it('첫 시도가 실패하면 재시도하여 성공한 결과를 반환한다', async () => {
      jest.useFakeTimers();
      fetchSpy
        .mockRejectedValueOnce(new Error('일시적 오류'))
        .mockResolvedValueOnce(
          fakeResponse(
            ytInitialDataHtml({
              videoRenderer: {
                videoId: 'vid1',
                lengthText: { simpleText: '3:45' },
              },
            }),
          ),
        );

      const promise = client.search('검색어');
      // 1번째 시도 실패 후 대기(FETCH_RETRY_DELAY_MS * 1 + 4000 = 5500ms)를 넘겨야
      // 2번째 시도(성공)로 넘어간다.
      await jest.advanceTimersByTimeAsync(6000);
      const result = await promise;

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ videoId: 'vid1', durationSec: 225 });
    });

    it('모든 시도가 실패하면 마지막 오류를 던진다', async () => {
      jest.useFakeTimers();
      fetchSpy.mockRejectedValue(new Error('지속 오류'));

      const promise = client.search('검색어');
      const assertion = expect(promise).rejects.toThrow('지속 오류');
      // MAX_FETCH_ATTEMPTS(4)회 모두 실패하는 동안의 대기 총합
      // (5500 + 7000 + 7500 = 20000ms)을 넘겨야 마지막 시도까지 끝난다.
      await jest.advanceTimersByTimeAsync(21000);
      await assertion;

      expect(fetchSpy).toHaveBeenCalledTimes(4);
    });

    it('logContext가 주어지면 재시도 경고와 최종 실패 로그에 포함한다', async () => {
      jest.useFakeTimers();
      fetchSpy.mockRejectedValue(new Error('지속 오류'));

      const promise = client.search('검색어', 'quizSongId: qs-1');
      const assertion = expect(promise).rejects.toThrow('지속 오류');
      await jest.advanceTimersByTimeAsync(21000);
      await assertion;

      expect(Logger.prototype.warn).toHaveBeenCalledWith(
        expect.stringContaining('(quizSongId: qs-1)'),
      );
      expect(Logger.prototype.error).toHaveBeenCalledWith(
        expect.stringContaining('(quizSongId: qs-1)'),
        expect.anything(),
      );
    });

    it('응답이 실패(status)면 재시도 후 YoutubeFetchError를 던진다', async () => {
      jest.useFakeTimers();
      fetchSpy.mockResolvedValue(fakeResponse('', { ok: false, status: 500 }));

      const promise = client.search('검색어');
      const assertion = expect(promise).rejects.toThrow(YoutubeFetchError);
      await jest.advanceTimersByTimeAsync(21000);
      await assertion;
    });

    it('요청에 redirect: manual과 타임아웃 signal을 전달한다', async () => {
      fetchSpy.mockResolvedValueOnce(fakeResponse('내용 없음'));

      await client.getDurationSec('vid1');

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          redirect: 'manual',
          signal: expect.any(AbortSignal),
        }),
      );
    });
  });
});
