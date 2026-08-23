import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { getLogContext, summarizeForLog } from 'logger';
import { accessLogger } from './access-logger.factory';

/**
 * logging은 leaf/infra 모듈이라 user/admin 도메인 모듈을 import할 수 없다
 * (ARCHITECTURE.md). UserAuthGuard/AdminAuthGuard가 실제로 채우는 필드 모양만
 * 구조적으로 흉내내 검증된 userId가 있으면 그것부터 쓴다.
 */
interface RequestWithVerifiedIdentity extends Request {
  user?: { userId?: string };
  admin?: { userId?: string };
}

function extractClaimedUserId(authHeader?: string): string | undefined {
  if (!authHeader?.startsWith('Bearer ')) {
    return undefined;
  }
  const payloadSegment = authHeader.slice('Bearer '.length).split('.')[1];
  if (!payloadSegment) {
    return undefined;
  }
  try {
    const payload = JSON.parse(
      Buffer.from(payloadSegment, 'base64url').toString('utf8'),
    );
    return typeof payload?.userId === 'string' ? payload.userId : undefined;
  } catch {
    return undefined;
  }
}

function extractErrorMessage(body: unknown): string | undefined {
  const message = (body as { message?: unknown } | undefined)?.message;
  if (typeof message === 'string') {
    return message;
  }
  if (Array.isArray(message)) {
    return message.join(', ');
  }
  return undefined;
}

@Injectable()
export class AccessLogMiddleware implements NestMiddleware {
  use(
    req: RequestWithVerifiedIdentity,
    res: Response,
    next: NextFunction,
  ): void {
    const startedAt = process.hrtime.bigint();

    let responseBody: unknown;
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      responseBody = body;
      return originalJson(body);
    };

    res.on('finish', () => {
      // res.on('finish')는 응답이 다 나간 뒤(핸들러 실행 이후) 발생하므로,
      // UserAuthGuard/AdminAuthGuard를 통과한 요청이면 이 시점엔 이미
      // req.user/req.admin이 채워져 있다.
      const verifiedUserId = req.user?.userId ?? req.admin?.userId;

      const responseTimeMs =
        Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const query = summarizeForLog(req.query);
      const body = summarizeForLog(req.body);

      const level =
        res.statusCode >= 500
          ? 'error'
          : res.statusCode >= 400
            ? 'warn'
            : 'info';

      accessLogger.log({
        level,
        message: `${req.method} ${req.path}`,
        service: 'api',
        environment: process.env.NODE_ENV ?? 'development',
        ...getLogContext(),
        ip: req.ip,
        method: req.method,
        path: req.path,
        ...(query && Object.keys(query as object).length ? { query } : {}),
        ...(body && Object.keys(body as object).length ? { body } : {}),
        statusCode: res.statusCode,
        responseTimeMs: Math.round(responseTimeMs * 100) / 100,
        // verifiedUserId는 서명 검증을 거친 값, claimedUserId는 Authorization
        // 헤더의 JWT를 서명 검증 없이 그냥 디코드한 값이라 신뢰할 수 없다 —
        // 절대 같은 필드명(userId)으로 섞어 쓰지 않는다.
        ...(verifiedUserId
          ? { userId: verifiedUserId }
          : {
              claimedUserId: extractClaimedUserId(req.headers.authorization),
            }),
        userAgent: req.headers['user-agent'],
        ...(res.statusCode >= 400
          ? { errorMessage: extractErrorMessage(responseBody) }
          : {}),
      });
    });

    next();
  }
}
