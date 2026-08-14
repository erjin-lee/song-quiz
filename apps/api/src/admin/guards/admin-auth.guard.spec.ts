import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AdminAuthGuard, AdminAuthenticatedRequest } from './admin-auth.guard';

describe('AdminAuthGuard', () => {
  let guard: AdminAuthGuard;

  const jwtServiceMock = {
    verify: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new AdminAuthGuard(jwtServiceMock as unknown as JwtService);
  });

  function createContext(authorization?: string): ExecutionContext {
    const request = { headers: { authorization } } as AdminAuthenticatedRequest;
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

  it('유효한 토큰이면 통과시키고 request.admin에 payload를 부착한다', () => {
    const payload = {
      sub: '1',
      userId: '1',
      loginId: 'admin',
      nickNm: '관리자',
      role: 'ADMIN' as const,
    };
    jwtServiceMock.verify.mockReturnValue(payload);
    const context = createContext('Bearer valid-token');

    const result = guard.canActivate(context);

    expect(result).toBe(true);
    expect(jwtServiceMock.verify).toHaveBeenCalledWith('valid-token', {
      secret: process.env.ADMIN_JWT_SECRET,
    });
    const request = context
      .switchToHttp()
      .getRequest<AdminAuthenticatedRequest>();
    expect(request.admin).toEqual(payload);
  });
});
