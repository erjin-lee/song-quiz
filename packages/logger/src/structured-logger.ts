import * as path from 'path';
import { LoggerService } from '@nestjs/common';
import {
  createLogger,
  format,
  Logger as WinstonLogger,
  transports,
} from 'winston';
import 'winston-daily-rotate-file';
import { createConsoleFormat, TIMESTAMP_FORMAT } from './console-format';
import { getLogContext, LogContext } from './log-context';

export interface StructuredLoggerOptions {
  service: LogContext['service'];
  environment: string;
  /** 로그 파일을 남길 디렉토리. 기본값은 process.cwd()/logs (access log와 동일한 컨벤션). */
  logDir?: string;
  /** 파일명 prefix. 기본값 'app' → app-%DATE%.log (access-%DATE%.log와 구분). */
  filenamePrefix?: string;
}

type NestLogLevel = 'log' | 'error' | 'warn' | 'debug' | 'verbose' | 'fatal';

const WINSTON_LEVEL_BY_NEST_LEVEL: Record<NestLogLevel, string> = {
  log: 'info',
  error: 'error',
  warn: 'warn',
  debug: 'debug',
  verbose: 'verbose',
  fatal: 'error',
};

function createWinstonLogger(options: StructuredLoggerOptions): WinstonLogger {
  const logDir = options.logDir ?? path.join(process.cwd(), 'logs');
  const filenamePrefix = options.filenamePrefix ?? 'app';

  return createLogger({
    level: 'debug',
    transports: [
      new transports.Console({
        format: createConsoleFormat(
          options.environment,
          ({ timestamp, level, message, context, ...meta }) => {
            const contextLabel = context ? `[${context}] ` : '';
            const rest = Object.entries(meta)
              .filter(([, value]) => value !== undefined)
              .map(
                ([key, value]) =>
                  `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`,
              )
              .join(' ');
            return `${timestamp} [${level}] ${contextLabel}${message}${rest ? ` ${rest}` : ''}`;
          },
        ),
      }),
      new transports.DailyRotateFile({
        dirname: logDir,
        filename: `${filenamePrefix}-%DATE%.log`,
        datePattern: 'YYYY-MM-DD',
        maxFiles: '14d',
        zippedArchive: true,
        format: format.combine(
          format.timestamp({ format: TIMESTAMP_FORMAT }),
          format.json(),
        ),
      }),
    ],
  });
}

/**
 * Nest의 Logger(ClassName) 인스턴스는 error()에서 optionalParams 끝에 항상
 * this.context를 붙여 델리게이트한다(예: error(err) → 실제로는 [err, 'ClassName']).
 * 이 코드베이스는 error(message, error)처럼 두 번째 인자로 Error 객체를 그대로
 * 넘기는 관행이 흔해서(예: melon-scraper.client.ts, inquiry.service.ts), 마지막
 * 값만이 아니라 optionalParams 전체를 훑어 Error 인스턴스의 message/stack을
 * 따로 보존한다. app.useLogger(structuredLogger)로 등록해두면 이 처리가
 * 호출부 수정 없이 기존 로그 전체에 자동으로 적용된다.
 */
function splitOptionalParams(optionalParams: unknown[]): {
  context?: string;
  stack?: string;
  errorMessage?: string;
} {
  let context: string | undefined;
  let stack: string | undefined;
  let errorMessage: string | undefined;

  optionalParams.forEach((param, index) => {
    if (param instanceof Error) {
      errorMessage = param.message;
      stack = param.stack;
      return;
    }
    if (typeof param !== 'string') {
      return;
    }
    // 마지막 문자열 인자는 Nest 컨벤션상 클래스명(context)이다. 그 외의 문자열은
    // error(message, err.stack) 처럼 수동으로 넘긴 스택 트레이스로 취급한다.
    if (index === optionalParams.length - 1 && !param.includes('\n')) {
      context = param;
    } else {
      stack = param;
    }
  });

  return { context, stack, errorMessage };
}

/**
 * NestJS LoggerService 구현체. app.useLogger(new StructuredLogger(...))로 등록하면
 * 앱 전역의 new Logger(ClassName) 호출까지 전부 이 로거로 델리게이트되어, 파일별
 * 수정 없이도 LogContext(service/environment/requestId/traceId/...) 필드가 실린
 * JSON 로그로 바뀐다.
 */
export class StructuredLogger implements LoggerService {
  private readonly winston: WinstonLogger;
  private readonly base: Pick<LogContext, 'service' | 'environment'>;

  constructor(options: StructuredLoggerOptions) {
    this.base = { service: options.service, environment: options.environment };
    this.winston = createWinstonLogger(options);
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.write('log', message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.write('error', message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.write('warn', message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.write('debug', message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.write('verbose', message, optionalParams);
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.write('fatal', message, optionalParams);
  }

  private write(
    nestLevel: NestLogLevel,
    message: unknown,
    optionalParams: unknown[],
  ): void {
    const { context, stack, errorMessage } =
      splitOptionalParams(optionalParams);

    this.winston.log({
      level: WINSTON_LEVEL_BY_NEST_LEVEL[nestLevel],
      message: typeof message === 'string' ? message : JSON.stringify(message),
      ...this.base,
      ...getLogContext(),
      ...(context ? { context } : {}),
      ...(stack ? { stack } : {}),
      ...(errorMessage ? { errorMessage } : {}),
    });
  }
}
