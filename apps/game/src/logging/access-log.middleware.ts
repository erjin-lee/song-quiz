import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { getLogContext, summarizeForLog } from 'logger';
import { accessLogger } from './access-logger.factory';

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
  use(req: Request, res: Response, next: NextFunction): void {
    const startedAt = process.hrtime.bigint();

    let responseBody: unknown;
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      responseBody = body;
      return originalJson(body);
    };

    res.on('finish', () => {
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
        service: 'game',
        environment: process.env.NODE_ENV ?? 'development',
        ...getLogContext(),
        ip: req.ip,
        method: req.method,
        path: req.path,
        ...(query && Object.keys(query as object).length ? { query } : {}),
        ...(body && Object.keys(body as object).length ? { body } : {}),
        statusCode: res.statusCode,
        responseTimeMs: Math.round(responseTimeMs * 100) / 100,
        // 서명 검증 없이 JWT payload를 그대로 디코드한 값이라 신뢰할 수 없다.
        // game REST에는 apps/api의 UserAuthGuard 같은 가드가 없어 검증된
        // userId로 승격할 방법이 없다 — 이 필드는 항상 claimedUserId로만 남긴다.
        claimedUserId: extractClaimedUserId(req.headers.authorization),
        userAgent: req.headers['user-agent'],
        ...(res.statusCode >= 400
          ? { errorMessage: extractErrorMessage(responseBody) }
          : {}),
      });
    });

    next();
  }
}
