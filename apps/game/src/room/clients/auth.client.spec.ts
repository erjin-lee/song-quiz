import { UnauthorizedException } from '@nestjs/common';
import { AuthClient } from './auth.client';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe('AuthClient', () => {
  let authClient: AuthClient;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    process.env.API_SERVICE_URL = 'http://api.local';
    process.env.INTERNAL_SERVICE_SECRET = 'secret';
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    authClient = new AuthClient();
  });

  it('Authorization 헤더가 없으면 apps/api를 호출하지 않고 undefined를 반환한다(게스트)', async () => {
    const result = await authClient.resolveOptionalAccountUserId(undefined);

    expect(result).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accountUserId가 있으면 그대로 반환하고 원본 Authorization 헤더를 그대로 전달한다', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { accountUserId: 'user-1' }));

    const result =
      await authClient.resolveOptionalAccountUserId('Bearer abc.def.ghi');

    expect(result).toBe('user-1');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.local/internal/auth/resolve-account-user',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer abc.def.ghi',
          'x-internal-secret': 'secret',
        }),
      }),
    );
  });

  it('accountUserId가 null이면 undefined로 정규화한다', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { accountUserId: null }));

    const result = await authClient.resolveOptionalAccountUserId('Bearer abc');

    expect(result).toBeUndefined();
  });

  it('apps/api가 401을 반환하면 UnauthorizedException을 던진다', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(401, {
        statusCode: 401,
        message: '인증 토큰이 유효하지 않습니다.',
      }),
    );

    await expect(
      authClient.resolveOptionalAccountUserId('Bearer invalid'),
    ).rejects.toThrow(UnauthorizedException);
  });
});
