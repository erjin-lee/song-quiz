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
 *
 * BaseExceptionFilter.catch()는 HttpException이 아닌 경우(주로 500)에는
 * handleUnknownError에서 이미 자체 Logger('ExceptionsHandler')로 error 레벨
 * 로그를 남긴다(그 로거도 app.useLogger(structuredLogger) 덕에 구조화 로그로
 * 나간다). 그래서 여기서는 HttpException일 때만 직접 로깅해서 중복 기록을
 * 피하고, 상태코드에 맞춰 4xx는 warn, 5xx는 error로 레벨을 나눈다.
 */
@Catch()
export class LoggingExceptionFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(LoggingExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    updateLogContext({ errorCode: resolveErrorCode(exception) });

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status >= 500) {
        this.logger.error(exception.message, exception.stack);
      } else {
        this.logger.warn(exception.message);
      }
    }

    super.catch(exception, host);
  }
}
