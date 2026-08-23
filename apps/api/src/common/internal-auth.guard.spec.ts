import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { InternalAuthGuard } from './internal-auth.guard';

function contextWithHeader(headerValue: string | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers: { 'x-internal-secret': headerValue } }),
    }),
  } as unknown as ExecutionContext;
}

describe('InternalAuthGuard', () => {
  const guard = new InternalAuthGuard();

  afterEach(() => {
    delete process.env.INTERNAL_SERVICE_SECRET;
  });

  it('헤더가 INTERNAL_SERVICE_SECRET과 일치하면 통과시킨다', () => {
    process.env.INTERNAL_SERVICE_SECRET = 'secret';

    expect(guard.canActivate(contextWithHeader('secret'))).toBe(true);
  });

  it('헤더가 일치하지 않으면 UnauthorizedException을 던진다', () => {
    process.env.INTERNAL_SERVICE_SECRET = 'secret';

    expect(() => guard.canActivate(contextWithHeader('wrong'))).toThrow(
      UnauthorizedException,
    );
  });

  it('INTERNAL_SERVICE_SECRET이 설정돼 있지 않으면 헤더값과 무관하게 거부한다', () => {
    delete process.env.INTERNAL_SERVICE_SECRET;

    expect(() => guard.canActivate(contextWithHeader(undefined))).toThrow(
      UnauthorizedException,
    );
  });
});
