import * as path from 'path';
import { LoggerService } from '@nestjs/common';
import { createLogger, format, Logger as WinstonLogger, transports } from 'winston';
import 'winston-daily-rotate-file';
import { getLogContext, LogContext } from './log-context';

const TIMESTAMP_FORMAT = 'YYYY-MM-DD HH:mm:ss.SSS';

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
        format: format.combine(
          format.timestamp({ format: TIMESTAMP_FORMAT }),
          format.printf(({ timestamp, level, message, context, ...meta }) => {
            const contextLabel = context ? `[${context}] ` : '';
            const rest = Object.entries(meta)
              .filter(([, value]) => value !== undefined)
              .map(
                ([key, value]) =>
                  `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`,
              )
              .join(' ');
            return `${timestamp} [${level}] ${contextLabel}${message}${rest ? ` ${rest}` : ''}`;
          }),
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
 * Nest는 error(message, stack?, context?) 형태로 마지막 인자에 클래스명을,
 * error 계열에서는 그 앞에 스택 트레이스를 넘긴다. new Logger(ClassName)로 만든
 * 기존 인스턴스도 app.useLogger(structuredLogger)로 등록하면 이 인자 그대로
 * 델리게이트되므로, 호출부 수정 없이도 context/stack이 구조화 로그에 실린다.
 */
function splitOptionalParams(optionalParams: unknown[]): {
  context?: string;
  stack?: string;
} {
  const last = optionalParams[optionalParams.length - 1];
  if (typeof last !== 'string') {
    return {};
  }
  return last.includes('\n') ? { stack: last } : { context: last };
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
    const { context, stack } = splitOptionalParams(optionalParams);

    this.winston.log({
      level: WINSTON_LEVEL_BY_NEST_LEVEL[nestLevel],
      message: typeof message === 'string' ? message : JSON.stringify(message),
      ...this.base,
      ...getLogContext(),
      ...(context ? { context } : {}),
      ...(stack ? { stack } : {}),
    });
  }
}
