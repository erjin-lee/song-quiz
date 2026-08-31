import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { Request } from 'express';

/** Slack 요청 시각과 5분 이상 차이나면 재생 공격으로 간주해 거부한다(Slack 권장). */
const MAX_REQUEST_AGE_SEC = 60 * 5;

interface SlackSignedRequest extends Request {
  /** main.ts의 NestFactory.create({ rawBody: true })가 채워주는 원문 버퍼. */
  rawBody?: Buffer;
}

/**
 * Slack Interactivity 요청의 서명을 검증한다(Slack 공식 v0 방식):
 * https://api.slack.com/authentication/verifying-requests-from-slack
 *
 * InternalAuthGuard(apps/api/src/common/internal-auth.guard.ts)와 같은 원칙 -
 * SLACK_SIGNING_SECRET이 비어 있으면(아직 Slack 앱을 만들지 않은 경우 등) 항상
 * 거부한다(secure by default).
 */
@Injectable()
export class SlackSignatureGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<SlackSignedRequest>();
    const signingSecret = process.env.SLACK_SIGNING_SECRET;
    if (!signingSecret) {
      throw new UnauthorizedException('Slack 서명 검증 설정이 없습니다.');
    }

    const timestamp = request.headers['x-slack-request-timestamp'];
    const signature = request.headers['x-slack-signature'];
    if (typeof timestamp !== 'string' || typeof signature !== 'string') {
      throw new UnauthorizedException('Slack 서명 헤더가 없습니다.');
    }

    const timestampSec = Number(timestamp);
    if (
      !Number.isFinite(timestampSec) ||
      Math.abs(Date.now() / 1000 - timestampSec) > MAX_REQUEST_AGE_SEC
    ) {
      throw new UnauthorizedException('Slack 요청 시각이 유효하지 않습니다.');
    }

    if (!request.rawBody) {
      throw new UnauthorizedException('Slack 요청 본문을 읽을 수 없습니다.');
    }

    const baseString = `v0:${timestamp}:${request.rawBody.toString('utf8')}`;
    const expectedSignature = `v0=${createHmac('sha256', signingSecret)
      .update(baseString)
      .digest('hex')}`;

    const expected = Buffer.from(expectedSignature, 'utf8');
    const actual = Buffer.from(signature, 'utf8');
    if (
      expected.length !== actual.length ||
      !timingSafeEqual(expected, actual)
    ) {
      throw new UnauthorizedException('Slack 서명이 일치하지 않습니다.');
    }

    return true;
  }
}
