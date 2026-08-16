import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserAuthGuard, UserAuthenticatedRequest } from './user-auth.guard';

describe('UserAuthGuard', () => {
  let guard: UserAuthGuard;

  const jwtServiceMock = {
    verify: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new UserAuthGuard(jwtServiceMock as unknown as JwtService);
  });

  function createContext(authorization?: string): ExecutionContext {
    const request = { headers: { authorization } } as UserAuthenticatedRequest;
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  }

  it('Authorization 헤더가 없으면 UnauthorizedException을 던진다', () => {
    expect(() => guard.canActivate(createContext(undefined))).toThrow(
      UnauthorizedException,
    );
    expect(jwtServiceMock.verify).not.toHaveBeenCalled();
  });

  it('Bearer 형식이 아니면 UnauthorizedException을 던진다', () => {
    expect(() => guard.canActivate(createContext('Basic abc123'))).toThrow(
      UnauthorizedException,
    );
    expect(jwtServiceMock.verify).not.toHaveBeenCalled();
  });

  it('토큰 검증에 실패하면 UnauthorizedException을 던진다', () => {
    jwtServiceMock.verify.mockImplementation(() => {
      throw new Error('invalid token');
    });

    expect(() => guard.canActivate(createContext('Bearer invalid'))).toThrow(
      UnauthorizedException,
    );
  });

  it('유효한 토큰이면 통과시키고 request.user에 payload를 부착한다', () => {
    const payload = {
      sub: 'u-1',
      userId: 'u-1',
      loginId: 'songquiz01',
      nickNm: '노래왕',
    };
    jwtServiceMock.verify.mockReturnValue(payload);
    const context = createContext('Bearer valid-token');

    const result = guard.canActivate(context);

    expect(result).toBe(true);
    expect(jwtServiceMock.verify).toHaveBeenCalledWith('valid-token', {
      secret: process.env.USER_JWT_SECRET,
    });
    const request = context
      .switchToHttp()
      .getRequest<UserAuthenticatedRequest>();
    expect(request.user).toEqual(payload);
  });
});
