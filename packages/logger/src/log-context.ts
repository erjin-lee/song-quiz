import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * 요청/소켓 메시지 생명주기 동안 유지되는 상관관계 값. AsyncLocalStorage에
 * 저장되어 runWithLogContext/updateLogContext로 채우고, 그 스코프 안의 모든
 * 로그 호출에 자동으로 실린다.
 *
 * event/errorCode/durationMs는 여기 없다 — "이 로그 한 건"에만 해당하는 값을
 * ambient context에 넣으면, 같은 요청 스코프 안에서 나중에 찍히는 무관한 로그
 * (access log 등)까지 그 값을 그대로 물려받는 문제가 있다. 그 필드들은
 * LogMetadata로 분리해 로거 호출마다 명시적으로 넘긴다(structured-logger.ts).
 */
export interface LogContext {
  service: 'api' | 'game';
  environment: string;

  requestId?: string;
  traceId?: string;

  /** 이 시스템의 유저 식별자는 항상 UUID 문자열이다(User.userId, JWT userId claim, 소켓 payload 전부 string). */
  userId?: string;
  /** 서명 검증 없이 JWT payload를 그대로 디코드한 값 등, 신뢰할 수 없는 출처의 userId. userId와 동시에 채우지 않는다. */
  claimedUserId?: string;
  roomId?: string;

  /**
   * 예외적으로 여기 남아있다: LoggingExceptionFilter가 BaseExceptionFilter의
   * 자체 내부 로깅(HttpException이 아닌 예외를 Logger('ExceptionsHandler')로
   * 직접 로깅 — 우리가 호출 인자를 제어할 수 없다)에도 errorCode가 실리게
   * 하려면 ambient로 채우는 방법뿐이다. 그 외의 모든 곳에서는 이 필드를
   * updateLogContext로 채우지 말고 LogMetadata로 로거 호출에 직접 넘긴다.
   */
  errorCode?: string;
}

/**
 * 로그 한 건에만 붙는 메타데이터. LogContext(ambient)와 달리 로거 호출마다
 * 명시적으로 넘겨야 한다 — 예: `this.logger.error(message, { event, errorCode })`.
 * StructuredLogger가 Nest Logger의 optionalParams에서 일반 객체를 찾아 이
 * 필드들로 병합한다(§structured-logger.ts).
 */
export interface LogMetadata {
  event?: string;
  errorCode?: string;
  durationMs?: number;
}

const logContextStorage = new AsyncLocalStorage<Partial<LogContext>>();

/** context를 현재 AsyncLocalStorage에 심고 그 안에서 fn을 실행한다. */
export function runWithLogContext<T>(
  context: Partial<LogContext>,
  fn: () => T,
): T {
  return logContextStorage.run(context, fn);
}

/** 현재 AsyncLocalStorage에 저장된 context를 읽는다. 바깥 요청 흐름이 없으면 빈 객체. */
export function getLogContext(): Partial<LogContext> {
  return logContextStorage.getStore() ?? {};
}

/** 현재 context에 필드를 얹는다(같은 요청 흐름 안에서 뒤늦게 알게 된 userId 등을 채울 때). */
export function updateLogContext(patch: Partial<LogContext>): void {
  const store = logContextStorage.getStore();
  if (store) {
    Object.assign(store, patch);
  }
}
