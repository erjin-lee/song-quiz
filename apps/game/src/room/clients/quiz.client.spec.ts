import { NotFoundException } from '@nestjs/common';
import { QuizClient } from './quiz.client';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe('QuizClient', () => {
  let quizClient: QuizClient;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    process.env.API_SERVICE_URL = 'http://api.local';
    process.env.INTERNAL_SERVICE_SECRET = 'secret';
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    quizClient = new QuizClient();
  });

  it('getSummary는 성공 응답을 그대로 반환한다', async () => {
    const summary = {
      quizId: '1',
      quizTtl: '아이유',
      quizDesc: null,
      thumbImgUrl: null,
      songCount: 2,
      atstIds: ['10'],
      atstNms: ['아이유'],
    };
    fetchMock.mockResolvedValue(jsonResponse(200, summary));

    const result = await quizClient.getSummary('1');

    expect(result).toEqual(summary);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.local/internal/quizzes/1/summary',
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-internal-secret': 'secret' }),
      }),
    );
  });

  it('404 응답은 NotFoundException으로 변환한다', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(404, {
        statusCode: 404,
        message: '퀴즈를 찾을 수 없습니다.',
      }),
    );

    await expect(quizClient.getSummary('999')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('getQuizRounds는 quizId 하나로 전체 라운드 데이터를 GET한다', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, []));

    await quizClient.getQuizRounds('1');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.local/internal/quizzes/1/rounds',
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-internal-secret': 'secret' }),
      }),
    );
  });
});
