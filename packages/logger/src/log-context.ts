import { AsyncLocalStorage } from 'node:async_hooks';

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
