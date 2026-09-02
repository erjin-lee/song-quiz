import {
  InquiryGptClient,
  InquiryGptError,
  InquirySongContext,
} from './inquiry-gpt.client';
import { OpenAiChatClient } from '../openai/openai-chat.client';
import { YoutubeScraperClient } from '../quiz/youtube-scraper.client';

describe('InquiryGptClient', () => {
  let client: InquiryGptClient;

  const song: InquirySongContext = {
    quizSongId: 'qs1',
    songNm: '너에게 닿기를',
    atstNm: '아이유',
    startSec: 10,
    youtubeUrl: 'https://www.youtube.com/watch?v=abc',
    durationSec: 200,
  };

  const openAiChatClientMock = {
    requestJson: jest.fn(),
  };
  const youtubeScraperClientMock = {
    getVideoInfo: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    client = new InquiryGptClient(
      openAiChatClientMock as unknown as OpenAiChatClient,
      youtubeScraperClientMock as unknown as YoutubeScraperClient,
    );
  });

  describe('classify', () => {
    it('매칭된 함수와 인자를 반환한다', async () => {
      openAiChatClientMock.requestJson.mockResolvedValue(
        JSON.stringify({
          matchedFunction: 'CHANGE_START_TIME',
          args: { startSec: 30 },
        }),
      );

      const result = await client.classify(song, '시작이 너무 늦어요');

      expect(result).toEqual({
        matchedFunction: 'CHANGE_START_TIME',
        args: { startSec: 30 },
      });
    });

    it('matchedFunction이 null이면 매칭 없음으로 반환한다', async () => {
      openAiChatClientMock.requestJson.mockResolvedValue(
        JSON.stringify({ matchedFunction: null, args: null }),
      );

      const result = await client.classify(song, '그냥 별로예요');

      expect(result).toEqual({ matchedFunction: null, args: null });
    });

    it('알 수 없는 함수명이면 매칭 없음으로 처리한다', async () => {
      openAiChatClientMock.requestJson.mockResolvedValue(
        JSON.stringify({ matchedFunction: 'DELETE_SONG', args: {} }),
      );

      const result = await client.classify(song, '문의');

      expect(result).toEqual({ matchedFunction: null, args: null });
    });

    it('args가 없으면 매칭 없음으로 처리한다', async () => {
      openAiChatClientMock.requestJson.mockResolvedValue(
        JSON.stringify({ matchedFunction: 'CHANGE_START_TIME' }),
      );

      const result = await client.classify(song, '문의');

      expect(result).toEqual({ matchedFunction: null, args: null });
    });

    it('JSON이 아닌 응답이면 InquiryGptError를 던진다', async () => {
      openAiChatClientMock.requestJson.mockResolvedValue('not json');

      await expect(client.classify(song, '문의')).rejects.toThrow(
        InquiryGptError,
      );
    });
  });

  describe('verifyConfidence', () => {
    it('CHANGE_START_TIME 검증 시 유저 메시지에 영상 길이를 포함한다', async () => {
      openAiChatClientMock.requestJson.mockResolvedValue(
        JSON.stringify({ confidence: 'HIGH' }),
      );

      await client.verifyConfidence(
        'CHANGE_START_TIME',
        song,
        '시작이 너무 늦어요',
        { startSec: 30 },
      );

      expect(openAiChatClientMock.requestJson).toHaveBeenCalledWith([
        expect.objectContaining({ role: 'system' }),
        expect.objectContaining({
          role: 'user',
          content: expect.stringContaining('영상 길이: 200초'),
        }),
      ]);
    });

    it('영상 길이를 모르면 "알 수 없음"으로 표기한다', async () => {
      openAiChatClientMock.requestJson.mockResolvedValue(
        JSON.stringify({ confidence: 'HIGH' }),
      );

      await client.verifyConfidence(
        'CHANGE_START_TIME',
        { ...song, durationSec: null },
        '시작이 너무 늦어요',
        { startSec: 30 },
      );

      expect(openAiChatClientMock.requestJson).toHaveBeenCalledWith([
        expect.objectContaining({ role: 'system' }),
        expect.objectContaining({
          role: 'user',
          content: expect.stringContaining('영상 길이: 알 수 없음'),
        }),
      ]);
    });

    it('CHANGE_LINK 검증 시에는 웹 검색 도구를 켜서 요청한다', async () => {
      openAiChatClientMock.requestJson.mockResolvedValue(
        JSON.stringify({ confidence: 'HIGH' }),
      );

      await client.verifyConfidence('CHANGE_LINK', song, '링크가 잘못됐어요', {
        youtubeUrl: 'https://www.youtube.com/watch?v=new',
      });

      expect(openAiChatClientMock.requestJson).toHaveBeenCalledWith(
        [
          expect.objectContaining({ role: 'system' }),
          expect.objectContaining({ role: 'user' }),
        ],
        { webSearch: true },
      );
    });

    it('CHANGE_START_TIME/ADD_ANSWER 검증 시에는 웹 검색 도구를 켜지 않는다', async () => {
      openAiChatClientMock.requestJson.mockResolvedValue(
        JSON.stringify({ confidence: 'HIGH' }),
      );

      await client.verifyConfidence(
        'CHANGE_START_TIME',
        song,
        '시작이 너무 늦어요',
        { startSec: 30 },
      );

      expect(openAiChatClientMock.requestJson).toHaveBeenCalledWith([
        expect.objectContaining({ role: 'system' }),
        expect.objectContaining({ role: 'user' }),
      ]);
    });

    it('신뢰도 값과 근거를 반환한다', async () => {
      openAiChatClientMock.requestJson.mockResolvedValue(
        JSON.stringify({ confidence: 'LOW', reason: '근거 없음' }),
      );

      const result = await client.verifyConfidence('ADD_ANSWER', song, '문의', {
        answerTxt: '너닿',
      });

      expect(result).toEqual({ confidence: 'LOW', reason: '근거 없음' });
    });

    it('reason이 응답에 없으면 빈 문자열로 폴백한다', async () => {
      openAiChatClientMock.requestJson.mockResolvedValue(
        JSON.stringify({ confidence: 'HIGH' }),
      );

      const result = await client.verifyConfidence('ADD_ANSWER', song, '문의', {
        answerTxt: '너닿',
      });

      expect(result).toEqual({ confidence: 'HIGH', reason: '' });
    });

    it('유효하지 않은 confidence면 InquiryGptError를 던진다', async () => {
      openAiChatClientMock.requestJson.mockResolvedValue(
        JSON.stringify({ confidence: 'UNKNOWN' }),
      );

      await expect(
        client.verifyConfidence('ADD_ANSWER', song, '문의', {
          answerTxt: '너닿',
        }),
      ).rejects.toThrow(InquiryGptError);
    });

    describe('CHANGE_LINK - 웹 검색으로 새 링크에 접근하지 못했을 때(linkAccessible: false)', () => {
      const newLinkArgs = { youtubeUrl: 'https://www.youtube.com/watch?v=new' };

      it('우리가 스크래핑한 정보로 웹 검색 없이 재검증한다', async () => {
        openAiChatClientMock.requestJson
          .mockResolvedValueOnce(
            JSON.stringify({
              confidence: 'LOW',
              reason: '웹에서 새 링크를 찾지 못함',
              linkAccessible: false,
            }),
          )
          .mockResolvedValueOnce(
            JSON.stringify({ confidence: 'MEDIUM', reason: '제목이 일치함' }),
          );
        youtubeScraperClientMock.getVideoInfo.mockResolvedValue({
          title: '아이유 - 너에게 닿기를',
          durationSec: 210,
        });

        const result = await client.verifyConfidence(
          'CHANGE_LINK',
          song,
          '링크가 잘못됐어요',
          newLinkArgs,
        );

        expect(youtubeScraperClientMock.getVideoInfo).toHaveBeenCalledWith(
          'new',
          expect.stringContaining('qs1'),
        );
        expect(openAiChatClientMock.requestJson).toHaveBeenCalledTimes(2);
        expect(openAiChatClientMock.requestJson).toHaveBeenLastCalledWith([
          expect.objectContaining({ role: 'system' }),
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining('아이유 - 너에게 닿기를'),
          }),
        ]);
        expect(result).toEqual({
          confidence: 'MEDIUM',
          reason: '제목이 일치함',
        });
      });

      it('폴백 결과가 HIGH여도(프롬프트 미준수) 코드에서 MEDIUM으로 낮춘다 - 제목만으로는 확신할 수 없어 반드시 관리자 검토를 거치게 한다', async () => {
        openAiChatClientMock.requestJson
          .mockResolvedValueOnce(
            JSON.stringify({
              confidence: 'LOW',
              reason: '웹에서 새 링크를 찾지 못함',
              linkAccessible: false,
            }),
          )
          .mockResolvedValueOnce(
            JSON.stringify({ confidence: 'HIGH', reason: '완전히 일치함' }),
          );
        youtubeScraperClientMock.getVideoInfo.mockResolvedValue({
          title: '아이유 - 너에게 닿기를',
          durationSec: 210,
        });

        const result = await client.verifyConfidence(
          'CHANGE_LINK',
          song,
          '링크가 잘못됐어요',
          newLinkArgs,
        );

        expect(result).toEqual({
          confidence: 'MEDIUM',
          reason: '완전히 일치함',
        });
      });

      it('2차(스크래핑 기반) GPT 요청이 실패하면 1차 결과를 그대로 반환한다', async () => {
        openAiChatClientMock.requestJson
          .mockResolvedValueOnce(
            JSON.stringify({
              confidence: 'LOW',
              reason: '웹에서 새 링크를 찾지 못함',
              linkAccessible: false,
            }),
          )
          .mockRejectedValueOnce(new Error('GPT 요청 타임아웃'));
        youtubeScraperClientMock.getVideoInfo.mockResolvedValue({
          title: '아이유 - 너에게 닿기를',
          durationSec: 210,
        });

        const result = await client.verifyConfidence(
          'CHANGE_LINK',
          song,
          '링크가 잘못됐어요',
          newLinkArgs,
        );

        expect(result).toEqual({
          confidence: 'LOW',
          reason: '웹에서 새 링크를 찾지 못함',
          linkAccessible: false,
        });
      });

      it('2차 GPT 응답이 유효하지 않은 JSON이어도 예외를 던지지 않고 1차 결과를 반환한다', async () => {
        openAiChatClientMock.requestJson
          .mockResolvedValueOnce(
            JSON.stringify({
              confidence: 'LOW',
              reason: '웹에서 새 링크를 찾지 못함',
              linkAccessible: false,
            }),
          )
          .mockResolvedValueOnce('이건 JSON이 아님');
        youtubeScraperClientMock.getVideoInfo.mockResolvedValue({
          title: '아이유 - 너에게 닿기를',
          durationSec: 210,
        });

        const result = await client.verifyConfidence(
          'CHANGE_LINK',
          song,
          '링크가 잘못됐어요',
          newLinkArgs,
        );

        expect(result).toEqual({
          confidence: 'LOW',
          reason: '웹에서 새 링크를 찾지 못함',
          linkAccessible: false,
        });
      });

      it('스크래핑도 실패하면 재검증 없이 1차 결과를 그대로 반환한다', async () => {
        openAiChatClientMock.requestJson.mockResolvedValueOnce(
          JSON.stringify({
            confidence: 'LOW',
            reason: '웹에서 새 링크를 찾지 못함',
            linkAccessible: false,
          }),
        );
        youtubeScraperClientMock.getVideoInfo.mockRejectedValue(
          new Error('유튜브 요청 실패'),
        );

        const result = await client.verifyConfidence(
          'CHANGE_LINK',
          song,
          '링크가 잘못됐어요',
          newLinkArgs,
        );

        expect(openAiChatClientMock.requestJson).toHaveBeenCalledTimes(1);
        expect(result).toEqual({
          confidence: 'LOW',
          reason: '웹에서 새 링크를 찾지 못함',
          linkAccessible: false,
        });
      });

      it('1차 응답이 모순되게 HIGH+linkAccessible:false를 반환하고 스크래핑도 실패하면, HIGH가 아니라 MEDIUM으로 낮춰서 반환한다', async () => {
        openAiChatClientMock.requestJson.mockResolvedValueOnce(
          JSON.stringify({
            confidence: 'HIGH',
            reason: '프롬프트를 어긴 모순된 응답',
            linkAccessible: false,
          }),
        );
        youtubeScraperClientMock.getVideoInfo.mockRejectedValue(
          new Error('유튜브 요청 실패'),
        );

        const result = await client.verifyConfidence(
          'CHANGE_LINK',
          song,
          '링크가 잘못됐어요',
          newLinkArgs,
        );

        expect(result).toEqual({
          confidence: 'MEDIUM',
          reason: '프롬프트를 어긴 모순된 응답',
          linkAccessible: false,
        });
      });

      it('1차 응답이 모순되게 HIGH+linkAccessible:false를 반환하고 2차 요청도 실패하면, HIGH가 아니라 MEDIUM으로 낮춰서 반환한다', async () => {
        openAiChatClientMock.requestJson
          .mockResolvedValueOnce(
            JSON.stringify({
              confidence: 'HIGH',
              reason: '프롬프트를 어긴 모순된 응답',
              linkAccessible: false,
            }),
          )
          .mockRejectedValueOnce(new Error('GPT 요청 타임아웃'));
        youtubeScraperClientMock.getVideoInfo.mockResolvedValue({
          title: '아이유 - 너에게 닿기를',
          durationSec: 210,
        });

        const result = await client.verifyConfidence(
          'CHANGE_LINK',
          song,
          '링크가 잘못됐어요',
          newLinkArgs,
        );

        expect(result).toEqual({
          confidence: 'MEDIUM',
          reason: '프롬프트를 어긴 모순된 응답',
          linkAccessible: false,
        });
      });

      it('linkAccessible이 false가 아니면(true/미포함) 재검증하지 않는다', async () => {
        openAiChatClientMock.requestJson.mockResolvedValueOnce(
          JSON.stringify({ confidence: 'HIGH', reason: '확인 완료' }),
        );

        await client.verifyConfidence(
          'CHANGE_LINK',
          song,
          '링크가 잘못됐어요',
          newLinkArgs,
        );

        expect(youtubeScraperClientMock.getVideoInfo).not.toHaveBeenCalled();
        expect(openAiChatClientMock.requestJson).toHaveBeenCalledTimes(1);
      });
    });
  });
});
