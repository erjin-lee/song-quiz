import { context as otelContext, trace, TraceFlags } from '@opentelemetry/api';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import { StructuredLogger } from './structured-logger';
import { runWithLogContext } from './log-context';

function loggerWithCapture(): {
  logger: StructuredLogger;
  calls: Record<string, unknown>[];
} {
  const logger = new StructuredLogger({
    service: 'game',
    environment: 'test',
    logDir: '/tmp/structured-logger-spec-logs',
    filenamePrefix: 'spec',
  });
  const calls: Record<string, unknown>[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const winston = (logger as any).winston;
  const originalLog = winston.log.bind(winston);
  winston.log = (info: Record<string, unknown>) => {
    calls.push(info);
    return originalLog(info);
  };
  return { logger, calls };
}

describe('StructuredLogger', () => {
  // 실제 앱에서는 tracing 패키지의 NodeSDK.start()가 이 ContextManager를 등록한다.
  // @opentelemetry/api 단독으로는 no-op manager라 context.with()가 아무 효과가
  // 없으므로, spanId 관련 테스트를 위해 여기서 직접 등록해 흉내낸다.
  const contextManager = new AsyncHooksContextManager();

  beforeAll(() => {
    contextManager.enable();
    otelContext.setGlobalContextManager(contextManager);
  });

  afterAll(() => {
    contextManager.disable();
  });

  it('두 번째 인자로 넘긴 메타데이터 객체(event/errorCode)가 request context 없이도 로그에 실린다', () => {
    // cache.service.ts의 Redis 연결 실패, room-timer.service.ts의 poll 루프처럼
    // HTTP/소켓 요청 스코프 밖(AsyncLocalStorage store 없음)에서 실행되는
    // 백그라운드 콜백을 흉내낸다 — runWithLogContext로 감싸지 않은 상태.
    const { logger, calls } = loggerWithCapture();

    logger.warn('Redis 연결 실패', { event: 'redis_connection_failed' });

    expect(calls).toHaveLength(1);
    expect(calls[0].event).toBe('redis_connection_failed');
    expect(calls[0].requestId).toBeUndefined();
  });

  it('메타데이터는 로그 한 건에만 붙고, 같은 request context의 다음 로그로 새지 않는다', () => {
    const { logger, calls } = loggerWithCapture();

    runWithLogContext(
      {
        service: 'game',
        environment: 'test',
        requestId: 'req-1',
        roomId: 'room-1',
      },
      () => {
        logger.log('방 생성됨', { event: 'room_created' });
        logger.log('그다음 로그(이벤트와 무관)');
      },
    );

    expect(calls).toHaveLength(2);
    expect(calls[0].event).toBe('room_created');
    expect(calls[0].roomId).toBe('room-1');
    // roomId는 ambient(request 생명주기)라 두 번째 로그에도 남지만,
    // event는 첫 번째 호출에만 넘긴 메타데이터라 여기엔 없어야 한다.
    expect(calls[1].roomId).toBe('room-1');
    expect(calls[1].event).toBeUndefined();
  });

  it('Nest Logger(ClassName) 델리게이트 컨벤션(메타데이터 뒤에 context 문자열)도 함께 처리한다', () => {
    const { logger, calls } = loggerWithCapture();

    // new Logger('RoomLockService').warn(msg, meta)를 app.useLogger 델리게이트가
    // warn(msg, meta, 'RoomLockService')로 바꿔 부르는 상황과 동일하다.
    logger.warn(
      '분산 락 획득 실패',
      { event: 'redis_lock_failed' },
      'RoomLockService',
    );

    expect(calls[0].event).toBe('redis_lock_failed');
    expect(calls[0].context).toBe('RoomLockService');
  });

  it('OTel 활성 span이 있으면 그 spanId를 매 로그 호출마다 실어 보낸다', () => {
    const { logger, calls } = loggerWithCapture();

    const span = trace.wrapSpanContext({
      traceId: '0af7651916cd43dd8448eb211c80319c',
      spanId: 'b7ad6b7169203331',
      traceFlags: TraceFlags.SAMPLED,
    });
    const activeContext = trace.setSpan(otelContext.active(), span);

    otelContext.with(activeContext, () => {
      logger.log('첫 번째 로그');
      logger.log('두 번째 로그');
    });
    logger.log('span 밖 로그');

    expect(calls[0].spanId).toBe('b7ad6b7169203331');
    expect(calls[1].spanId).toBe('b7ad6b7169203331');
    expect(calls[2].spanId).toBeUndefined();
  });
});
