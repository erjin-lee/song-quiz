import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { SameOriginGuard } from './same-origin.guard';

describe('SameOriginGuard', () => {
  let guard: SameOriginGuard;
  const originalCorsOrigin = process.env.CORS_ORIGIN;

  beforeEach(() => {
    guard = new SameOriginGuard();
    process.env.CORS_ORIGIN = 'https://noraemat.site,http://localhost:5173';
  });

  afterAll(() => {
    process.env.CORS_ORIGIN = originalCorsOrigin;
  });

  function createContext(origin?: string): ExecutionContext {
    const request = { headers: { origin } };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  }

  it('Origin 헤더가 없으면 ForbiddenException을 던진다', () => {
    expect(() => guard.canActivate(createContext(undefined))).toThrow(
      ForbiddenException,
    );
  });

  it('허용 목록에 없는 Origin이면 ForbiddenException을 던진다', () => {
    expect(() =>
      guard.canActivate(createContext('https://attacker.example')),
    ).toThrow(ForbiddenException);
  });

  it('허용 목록에 있는 Origin이면 통과시킨다', () => {
    expect(guard.canActivate(createContext('https://noraemat.site'))).toBe(
      true,
    );
  });
});
