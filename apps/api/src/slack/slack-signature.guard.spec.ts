import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { SlackSignatureGuard } from './slack-signature.guard';

const SIGNING_SECRET = 'test-signing-secret';

function validSignature(timestamp: string, rawBody: string): string {
  const baseString = `v0:${timestamp}:${rawBody}`;
  return `v0=${createHmac('sha256', SIGNING_SECRET).update(baseString).digest('hex')}`;
}

function contextWith(params: {
  timestamp?: string;
  signature?: string;
  rawBody?: string;
}): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: {
          'x-slack-request-timestamp': params.timestamp,
          'x-slack-signature': params.signature,
        },
        rawBody: params.rawBody
          ? Buffer.from(params.rawBody, 'utf8')
          : undefined,
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('SlackSignatureGuard', () => {
  const guard = new SlackSignatureGuard();

  afterEach(() => {
    delete process.env.SLACK_SIGNING_SECRET;
  });

  it('SLACK_SIGNING_SECRET이 설정돼 있지 않으면 항상 거부한다', () => {
    delete process.env.SLACK_SIGNING_SECRET;
    const timestamp = String(Math.floor(Date.now() / 1000));

    expect(() =>
      guard.canActivate(
        contextWith({
          timestamp,
          signature: validSignature(timestamp, 'payload=x'),
          rawBody: 'payload=x',
        }),
      ),
    ).toThrow(UnauthorizedException);
  });

  it('서명/타임스탬프 헤더가 없으면 거부한다', () => {
    process.env.SLACK_SIGNING_SECRET = SIGNING_SECRET;

    expect(() =>
      guard.canActivate(contextWith({ rawBody: 'payload=x' })),
    ).toThrow(UnauthorizedException);
  });

  it('타임스탬프가 5분 이상 오래되면 재생 공격으로 간주해 거부한다', () => {
    process.env.SLACK_SIGNING_SECRET = SIGNING_SECRET;
    const staleTimestamp = String(Math.floor(Date.now() / 1000) - 60 * 10);

    expect(() =>
      guard.canActivate(
        contextWith({
          timestamp: staleTimestamp,
          signature: validSignature(staleTimestamp, 'payload=x'),
          rawBody: 'payload=x',
        }),
      ),
    ).toThrow(UnauthorizedException);
  });

  it('rawBody가 없으면(main.ts의 rawBody 옵션 누락 등) 거부한다', () => {
    process.env.SLACK_SIGNING_SECRET = SIGNING_SECRET;
    const timestamp = String(Math.floor(Date.now() / 1000));

    expect(() =>
      guard.canActivate(
        contextWith({
          timestamp,
          signature: validSignature(timestamp, 'payload=x'),
        }),
      ),
    ).toThrow(UnauthorizedException);
  });

  it('서명이 일치하지 않으면 거부한다', () => {
    process.env.SLACK_SIGNING_SECRET = SIGNING_SECRET;
    const timestamp = String(Math.floor(Date.now() / 1000));

    expect(() =>
      guard.canActivate(
        contextWith({
          timestamp,
          signature: 'v0=wrong',
          rawBody: 'payload=x',
        }),
      ),
    ).toThrow(UnauthorizedException);
  });

  it('서명이 올바르면 통과시킨다', () => {
    process.env.SLACK_SIGNING_SECRET = SIGNING_SECRET;
    const timestamp = String(Math.floor(Date.now() / 1000));

    expect(
      guard.canActivate(
        contextWith({
          timestamp,
          signature: validSignature(timestamp, 'payload=x'),
          rawBody: 'payload=x',
        }),
      ),
    ).toBe(true);
  });
});
