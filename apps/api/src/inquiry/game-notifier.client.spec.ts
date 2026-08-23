import { GameNotifierClient } from './game-notifier.client';

function jsonResponse(status: number): Response {
  return { ok: status >= 200 && status < 300, status } as Response;
}

describe('GameNotifierClient', () => {
  let client: GameNotifierClient;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    process.env.GAME_SERVICE_URL = 'http://game.local';
    process.env.INTERNAL_SERVICE_SECRET = 'secret';
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    client = new GameNotifierClient();
  });

  it('apps/game의 내부 엔드포인트로 문의 결과를 전달한다', async () => {
    fetchMock.mockResolvedValue(jsonResponse(204));

    await client.notifyInquiryResult({
      userId: 'user-1',
      inquiryId: 'iq-1',
      status: 'COMPLETED',
      message: '반영되었습니다.',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://game.local/internal/rooms/inquiry-result',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-internal-secret': 'secret' }),
        body: JSON.stringify({
          userId: 'user-1',
          inquiryId: 'iq-1',
          status: 'COMPLETED',
          message: '반영되었습니다.',
        }),
      }),
    );
  });

  it('네트워크 오류가 나도 던지지 않는다(best-effort 알림)', async () => {
    fetchMock.mockRejectedValue(new Error('연결 실패'));

    await expect(
      client.notifyInquiryResult({
        userId: 'user-1',
        inquiryId: 'iq-1',
        status: 'COMPLETED',
        message: '반영되었습니다.',
      }),
    ).resolves.toBeUndefined();
  });

  it('apps/game이 실패 응답을 반환해도 던지지 않는다', async () => {
    fetchMock.mockResolvedValue(jsonResponse(500));

    await expect(
      client.notifyInquiryResult({
        userId: 'user-1',
        inquiryId: 'iq-1',
        status: 'COMPLETED',
        message: '반영되었습니다.',
      }),
    ).resolves.toBeUndefined();
  });
});
