import { Injectable } from '@nestjs/common';
import {
  internalRequestHeaders,
  throwForFailedResponse,
} from '../../common/internal-service.util';

interface ResolveAccountUserResponse {
  accountUserId: string | null;
}

/**
 * apps/api가 소유한 User 데이터를 얻기 위한 내부 HTTP 클라이언트. RoomController는
 * User Repository/Entity/UserService를 직접 참조하지 않고 반드시 이 클라이언트를
 * 거친다. apps/api의 UserService.resolveOptionalAccountUserId와 완전히 동일한 동작
 * (게스트는 undefined, 무효/비활성 계정은 401)을 그대로 프록시한다.
 */
@Injectable()
export class AuthClient {
  private readonly baseUrl = (
    process.env.API_SERVICE_URL ?? 'http://localhost:8001'
  ).replace(/\/$/, '');

  async resolveOptionalAccountUserId(
    authHeader: string | undefined,
  ): Promise<string | undefined> {
    if (!authHeader) {
      return undefined;
    }

    const response = await fetch(
      `${this.baseUrl}/internal/auth/resolve-account-user`,
      {
        headers: {
          ...internalRequestHeaders(),
          Authorization: authHeader,
        },
      },
    );
    if (!response.ok) {
      await throwForFailedResponse(response, '인증 토큰이 유효하지 않습니다.');
    }
    const body = (await response.json()) as ResolveAccountUserResponse;
    return body.accountUserId ?? undefined;
  }
}
