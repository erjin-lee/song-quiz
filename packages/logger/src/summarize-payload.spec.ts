import { summarizeForLog } from './summarize-payload.util';

describe('summarizeForLog', () => {
  it('작은 payload는 redaction만 적용해 그대로 반환한다', () => {
    const result = summarizeForLog({ nickname: 'iu', password: 'secret' });
    expect(result).toEqual({ nickname: 'iu', password: '***' });
  });

  it('maxBytes를 넘는 payload는 값 대신 크기/키 요약으로 바꾼다', () => {
    const bigValue = 'x'.repeat(100);
    const payload = { a: bigValue, b: bigValue };

    const result = summarizeForLog(payload, 50) as Record<string, unknown>;

    expect(result.truncated).toBe(true);
    expect(typeof result.byteLength).toBe('number');
    expect(result.byteLength as number).toBeGreaterThan(50);
    expect(result.keys).toEqual(['a', 'b']);
    expect(result).not.toHaveProperty('a');
  });

  it('null/undefined는 그대로 반환한다', () => {
    expect(summarizeForLog(undefined)).toBeUndefined();
    expect(summarizeForLog(null)).toBeNull();
  });
});
