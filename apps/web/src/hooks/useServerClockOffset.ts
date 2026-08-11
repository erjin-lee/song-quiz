import { useEffect, useState } from 'react';
import type { RoomSocket } from '../api/socket';

const SAMPLE_COUNT = 5;
const SAMPLE_INTERVAL_MS = 150;
/**
 * ack 응답 대기 타임아웃. 샘플링 도중 소켓이 응답 없이 끊기면(ack가 유실되면)
 * socket.io는 재전송하지 않으므로, 타임아웃 없이는 for 루프가 영구 대기해
 * offsetMs가 갱신되지 않는 문제가 생긴다.
 */
const ACK_TIMEOUT_MS = 2000;

interface ClockSample {
  offsetMs: number;
  rttMs: number;
}

function measureOnce(socket: RoomSocket): Promise<ClockSample> {
  return new Promise((resolve) => {
    const clientSentAt = Date.now();
    let settled = false;

    const timeoutId = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      // 타임아웃된 샘플은 rttMs를 Infinity로 표시해 최선값 선택에서 제외되도록 한다.
      resolve({ offsetMs: 0, rttMs: Infinity });
    }, ACK_TIMEOUT_MS);

    socket.emit('time:sync', { clientSentAt }, (response) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutId);
      const clientReceivedAt = Date.now();
      resolve({
        rttMs: clientReceivedAt - clientSentAt,
        // NTP 방식: 왕복 지연이 대칭이라 가정하고, 왕복 중간 시각에 서버 시각을 맞춘다.
        offsetMs: response.serverTime - (clientSentAt + clientReceivedAt) / 2,
      });
    });
  });
}

/**
 * 클라이언트 로컬 시계와 서버 시계의 오차(offsetMs)를 ping-pong으로 측정한다.
 * 서버 기준 현재 시각은 `Date.now() + offsetMs`로 추정할 수 있다.
 * 소켓이 (재)연결될 때마다 여러 번 샘플링해 RTT가 가장 작은(가장 신뢰도 높은) 값을 채택한다.
 */
export function useServerClockOffset(socket: RoomSocket | null): number {
  const [offsetMs, setOffsetMs] = useState(0);

  useEffect(() => {
    if (!socket) {
      return;
    }

    let cancelled = false;

    const syncClock = async () => {
      const samples: ClockSample[] = [];
      for (let i = 0; i < SAMPLE_COUNT; i++) {
        if (cancelled) {
          return;
        }
        samples.push(await measureOnce(socket));
        if (i < SAMPLE_COUNT - 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, SAMPLE_INTERVAL_MS),
          );
        }
      }
      if (cancelled) {
        return;
      }
      const validSamples = samples.filter((sample) =>
        Number.isFinite(sample.rttMs),
      );
      if (validSamples.length === 0) {
        return;
      }
      const best = validSamples.reduce((a, b) => (b.rttMs < a.rttMs ? b : a));
      setOffsetMs(best.offsetMs);
    };

    void syncClock();
    socket.on('connect', syncClock);

    return () => {
      cancelled = true;
      socket.off('connect', syncClock);
    };
  }, [socket]);

  return offsetMs;
}
