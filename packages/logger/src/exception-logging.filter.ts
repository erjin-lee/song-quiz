import { ArgumentsHost, Catch, HttpException, Logger } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { updateLogContext } from './log-context';

function resolveErrorCode(exception: unknown): string {
  if (exception instanceof HttpException) {
    return String(exception.getStatus());
  }
  if (exception instanceof Error) {
    return exception.constructor.name;
  }
  return 'UNKNOWN_ERROR';
}

/**
 * 예외를 LogContext(errorCode 포함)로 로깅한 뒤 BaseExceptionFilter.catch에
 * 그대로 위임한다 — 기존 응답 바디 포맷(Nest 기본 예외 응답)을 전혀 바꾸지 않는다.
 * AppModule에 APP_FILTER provider로 등록해서 쓴다:
 *
 *   {
 *     provide: APP_FILTER,
 *     useFactory: (httpAdapterHost: HttpAdapterHost) =>
 *       new LoggingExceptionFilter(httpAdapterHost.httpAdapter),
 *     inject: [HttpAdapterHost],
 *   }
 */
@Catch()
export class LoggingExceptionFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(LoggingExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const errorCode = resolveErrorCode(exception);
    const message = exception instanceof Error ? exception.message : String(exception);
    const stack = exception instanceof Error ? exception.stack : undefined;

    updateLogContext({ errorCode });
    this.logger.error(message, stack);

    super.catch(exception, host);
  }
}
