import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiGet, apiPatch, apiPost, ApiError } from './client';

function mockFetchOnce(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => undefined,
    ...response,
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('api client', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('apiGet은 API_BASE_URL과 경로를 합쳐 GET 요청을 보낸다', async () => {
    const fetchMock = mockFetchOnce({ json: async () => ({ ok: true }) });

    const result = await apiGet<{ ok: boolean }>('/quiz/1');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8001/quiz/1',
      expect.objectContaining({
        method: 'GET',
        credentials: 'include',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );
    expect(result).toEqual({ ok: true });
  });

  it('apiPost는 body를 JSON 문자열로 직렬화해서 보낸다', async () => {
    const fetchMock = mockFetchOnce({ json: async () => ({ created: true }) });

    await apiPost('/inquiry', { title: '문의' });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8001/inquiry',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ title: '문의' }),
      }),
    );
  });

  it('apiPatch는 body가 없으면 body를 undefined로 보낸다', async () => {
    const fetchMock = mockFetchOnce({ json: async () => undefined });

    await apiPatch('/quiz/1');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8001/quiz/1',
      expect.objectContaining({ method: 'PATCH', body: undefined }),
    );
  });

  it('응답 status가 204면 body를 파싱하지 않고 undefined를 반환한다', async () => {
    mockFetchOnce({ status: 204, json: async () => {
      throw new Error('204 응답은 json()이 호출되면 안 된다');
    } });

    const result = await apiGet('/rooms/1');

    expect(result).toBeUndefined();
  });

  it('응답이 실패하면 서버가 준 message로 ApiError를 던진다', async () => {
    mockFetchOnce({
      ok: false,
      status: 400,
      json: async () => ({ message: '잘못된 요청입니다' }),
    });

    await expect(apiGet('/quiz/1')).rejects.toMatchObject(
      new ApiError('잘못된 요청입니다', 400),
    );
  });

  it('message가 배열이면 콤마로 이어붙인다', async () => {
    mockFetchOnce({
      ok: false,
      status: 400,
      json: async () => ({ message: ['제목은 필수입니다', '퀴즈를 선택하세요'] }),
    });

    await expect(apiGet('/quiz/1')).rejects.toMatchObject(
      new ApiError('제목은 필수입니다, 퀴즈를 선택하세요', 400),
    );
  });

  it('실패 응답의 body를 파싱할 수 없으면 상태 코드가 포함된 기본 메시지를 사용한다', async () => {
    mockFetchOnce({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('invalid json');
      },
    });

    await expect(apiGet('/quiz/1')).rejects.toMatchObject(
      new ApiError('요청에 실패했습니다. (500)', 500),
    );
  });
});
