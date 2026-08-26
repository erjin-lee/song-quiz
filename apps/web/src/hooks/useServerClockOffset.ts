import { useEffect, useState } from 'react';
import type { RoomSocket } from '../api/socket';

const SAMPLE_COUNT = 8;

/**
 * ack 응답 대기 타임아웃. 샘플링 도중 소켓이 응답 없이 끊기면(ack가 유실되면)
 * socket.io는 재전송하지 않으므로, 타임아웃 없이는 측정이 영구 대기해
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
        // 왕복 지연이 대칭이라고 가정하고, 왕복 중간 시각에 서버 시각을 맞춘다.
        offsetMs:
            response.serverTime -
            (clientSentAt + clientReceivedAt) / 2,
      });
    });
  });
}

/**
 * 클라이언트 로컬 시계와 서버 시계의 오차(offsetMs)를 ping-pong으로 측정한다.
 * 서버 기준 현재 시각은 `Date.now() + offsetMs`로 추정할 수 있다.
 *
 * 소켓이 (재)연결될 때마다 여러 번 샘플링하고,
 * 그중 RTT가 가장 작은 샘플의 offset을 채택한다.
 * RTT가 가장 작은 샘플은 네트워크 큐잉/지터의 영향을 가장 적게 받았을
 * 가능성이 높다고 본다.
 */
export function useServerClockOffset(socket: RoomSocket | null): number {
  const [offsetMs, setOffsetMs] = useState(0);

  useEffect(() => {
    if (!socket) {
      return;
    }

    let cancelled = false;

    // 소켓이 아직 연결되지 않은 상태에서 syncClock()을 즉시 호출한 직후 'connect'
    // 이벤트가 곧바로 발화하면 두 호출이 겹칠 수 있다.
    // 이미 진행 중인 측정이 있으면 새 측정을 건너뛴다.
    let syncInFlight = false;

    const syncClock = async () => {
      if (syncInFlight) {
        return;
      }

      syncInFlight = true;

      try {
        // 샘플을 동시에 측정해, 일부 ack가 유실되더라도 전체 측정 시간이
        // ACK_TIMEOUT_MS를 크게 넘지 않도록 한다.
        const samples = await Promise.all(
            Array.from({ length: SAMPLE_COUNT }, () => measureOnce(socket)),
        );

        if (cancelled) {
          return;
        }

        const validSamples = samples.filter((sample) =>
            Number.isFinite(sample.rttMs),
        );

        if (validSamples.length === 0) {
          return;
        }
        const bestSample = validSamples.reduce((best, sample) =>
            sample.rttMs < best.rttMs ? sample : best,
        );
        setOffsetMs(bestSample.offsetMs);
      } finally {
        syncInFlight = false;
      }
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