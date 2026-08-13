import {
  InquiryGptClient,
  InquiryGptError,
  InquirySongContext,
} from './inquiry-gpt.client';
import { OpenAiChatClient } from '../openai/openai-chat.client';

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

  beforeEach(() => {
    jest.clearAllMocks();
    client = new InquiryGptClient(
      openAiChatClientMock as unknown as OpenAiChatClient,
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

    it('신뢰도 값을 반환한다', async () => {
      openAiChatClientMock.requestJson.mockResolvedValue(
        JSON.stringify({ confidence: 'LOW' }),
      );

      const result = await client.verifyConfidence('ADD_ANSWER', song, '문의', {
        answerTxt: '너닿',
      });

      expect(result).toBe('LOW');
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
  });
});
