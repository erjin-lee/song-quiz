import {
  buildCorrelationHeaders,
  REQUEST_ID_HEADER,
  TRACE_ID_HEADER,
} from './correlation-headers';
import { runWithLogContext } from './log-context';

describe('buildCorrelationHeaders', () => {
  it('현재 LogContext에 requestId가 있으면 internal 호출 헤더로 그대로 넘긴다', () => {
    runWithLogContext(
      { service: 'game', environment: 'test', requestId: 'req-123' },
      () => {
        const headers = buildCorrelationHeaders();
        expect(headers[REQUEST_ID_HEADER]).toBe('req-123');
      },
    );
  });

  it('traceId는 LogContext에 있어도 헤더에 싣지 않는다(OTel traceparent가 전파를 담당)', () => {
    runWithLogContext(
      {
        service: 'game',
        environment: 'test',
        requestId: 'req-123',
        traceId: 'trace-456',
      },
      () => {
        expect(buildCorrelationHeaders()).not.toHaveProperty(TRACE_ID_HEADER);
      },
    );
  });

  it('요청 흐름 밖(context 없음)에서는 빈 헤더를 반환한다', () => {
    expect(buildCorrelationHeaders()).toEqual({});
  });
});
