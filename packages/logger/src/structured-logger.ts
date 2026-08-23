import * as path from 'path';
import { LoggerService } from '@nestjs/common';
import { trace } from '@opentelemetry/api';
import {
  createLogger,
  format,
  Logger as WinstonLogger,
  transports,
} from 'winston';
import 'winston-daily-rotate-file';
import { createConsoleFormat, TIMESTAMP_FORMAT } from './console-format';
import { getLogContext, LogContext, LogMetadata } from './log-context';

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
 *
 * 일반 객체(Error도 문자열도 아닌)가 하나 섞여 있으면 LogMetadata(event/
 * errorCode/durationMs)로 취급한다 — `this.logger.error(message, { event })`
 * 처럼 호출부가 로그 한 건에만 해당하는 값을 직접 넘길 수 있게 하기 위함이다.
 * ambient LogContext(AsyncLocalStorage)에 넣지 않는 이유는 log-context.ts 참고.
 */
function splitOptionalParams(optionalParams: unknown[]): {
  context?: string;
  stack?: string;
  errorMessage?: string;
  metadata?: LogMetadata;
} {
  let context: string | undefined;
  let stack: string | undefined;
  let errorMessage: string | undefined;
  let metadata: LogMetadata | undefined;

  optionalParams.forEach((param, index) => {
    if (param instanceof Error) {
      errorMessage = param.message;
      stack = param.stack;
      return;
    }
    if (typeof param === 'string') {
      // 마지막 문자열 인자는 Nest 컨벤션상 클래스명(context)이다. 그 외의
      // 문자열은 error(message, err.stack) 처럼 수동으로 넘긴 스택 트레이스로 취급한다.
      if (index === optionalParams.length - 1 && !param.includes('\n')) {
        context = param;
      } else {
        stack = param;
      }
      return;
    }
    if (param && typeof param === 'object' && !Array.isArray(param)) {
      metadata = param as LogMetadata;
    }
  });

  return { context, stack, errorMessage, metadata };
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
    const { context, stack, errorMessage, metadata } =
      splitOptionalParams(optionalParams);

    // spanId는 requestId/traceId와 달리 ambient LogContext(AsyncLocalStorage)에
    // 넣지 않는다 — 같은 요청 안에서도 custom span이 열리고 닫힐 때마다 바뀌는
    // "로그 한 건" 수준의 값이라, 매 로그 호출 시점에 활성 span에서 직접 읽어야
    // 나중에 game.prepare_round 같은 custom span을 추가했을 때 그 안에서 찍는
    // 로그가 자동으로 올바른 spanId를 갖는다(log-context.ts의 event/errorCode/
    // durationMs를 ambient에 넣지 않는 이유와 동일).
    const spanId = trace.getActiveSpan()?.spanContext().spanId;

    this.winston.log({
      level: WINSTON_LEVEL_BY_NEST_LEVEL[nestLevel],
      message: typeof message === 'string' ? message : JSON.stringify(message),
      ...this.base,
      ...getLogContext(),
      ...(spanId ? { spanId } : {}),
      ...(context ? { context } : {}),
      ...(stack ? { stack } : {}),
      ...(errorMessage ? { errorMessage } : {}),
      // metadata(로그 한 건짜리 event/errorCode/durationMs)는 ambient
      // LogContext보다 뒤에 스프레드해서, 겹치는 필드가 있으면 이 호출에
      // 명시적으로 넘긴 값이 우선하게 한다.
      ...(metadata ?? {}),
    });
  }
}
