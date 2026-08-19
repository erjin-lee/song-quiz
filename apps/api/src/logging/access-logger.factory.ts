import * as path from 'path';
import { createLogger, format, Logger, transports } from 'winston';
import 'winston-daily-rotate-file';

const LOG_DIR = path.join(process.cwd(), 'logs');
const TIMESTAMP_FORMAT = 'YYYY-MM-DD HH:mm:ss.SSS';

function createAccessLogger(): Logger {
  return createLogger({
    level: 'info',
    transports: [
      new transports.Console({
        format: format.combine(
          format.timestamp({ format: TIMESTAMP_FORMAT }),
          format.printf(({ timestamp, level, ...meta }) => {
            const {
              method,
              path: reqPath,
              statusCode,
              responseTimeMs,
              ip,
              userId,
              errorMessage,
            } = meta as Record<string, unknown>;
            const suffix = errorMessage ? ` error="${errorMessage}"` : '';
            return `${timestamp} [${level}] ${method} ${reqPath} ${statusCode} ${responseTimeMs}ms ip=${ip} userId=${userId ?? '-'}${suffix}`;
          }),
        ),
      }),
      new transports.DailyRotateFile({
        dirname: LOG_DIR,
        filename: 'access-%DATE%.log',
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
 * NestJS의 DI 미들웨어 인스턴스는 AppModule.configure()를 호출한 모듈
 * 컨텍스트에서 의존성을 조회하므로(LoggingModule을 @Global로 선언해도
 * 해결되지 않음), 토큰 주입 대신 모듈 싱글턴을 직접 참조한다.
 */
export const accessLogger: Logger = createAccessLogger();
