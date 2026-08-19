import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { accessLogger } from './access-logger.factory';
import { redactSensitiveFields } from './redact-sensitive-fields.util';

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
      const query = redactSensitiveFields(req.query);
      const body = redactSensitiveFields(req.body);

      const level =
        res.statusCode >= 500
          ? 'error'
          : res.statusCode >= 400
            ? 'warn'
            : 'info';

      accessLogger.log({
        level,
        message: `${req.method} ${req.path}`,
        ip: req.ip,
        method: req.method,
        path: req.path,
        ...(query && Object.keys(query as object).length ? { query } : {}),
        ...(body && Object.keys(body as object).length ? { body } : {}),
        statusCode: res.statusCode,
        responseTimeMs: Math.round(responseTimeMs * 100) / 100,
        userId: extractClaimedUserId(req.headers.authorization),
        userAgent: req.headers['user-agent'],
        ...(res.statusCode >= 400
          ? { errorMessage: extractErrorMessage(responseBody) }
          : {}),
      });
    });

    next();
  }
}
