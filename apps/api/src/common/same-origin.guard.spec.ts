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

  function createContext(
    origin?: string,
    host = 'api.noraemat.site',
    protocol = 'https',
  ): ExecutionContext {
    const request = {
      headers: { origin },
      protocol,
      get: (name: string) => (name === 'host' ? host : undefined),
    };
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

  it('허용 목록에 없고 API 자신의 origin도 아니면 ForbiddenException을 던진다', () => {
    expect(() =>
      guard.canActivate(createContext('https://attacker.example')),
    ).toThrow(ForbiddenException);
  });

  it('허용 목록에 있는 Origin이면 통과시킨다', () => {
    expect(guard.canActivate(createContext('https://noraemat.site'))).toBe(
      true,
    );
  });

  it('CORS 허용 목록에 없어도 API 자신의 origin(Swagger UI 등)이면 통과시킨다', () => {
    expect(
      guard.canActivate(
        createContext('https://api.noraemat.site', 'api.noraemat.site', 'https'),
      ),
    ).toBe(true);
  });
});
