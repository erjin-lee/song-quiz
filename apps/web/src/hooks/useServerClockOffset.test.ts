import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useServerClockOffset } from './useServerClockOffset';
import type { RoomSocket, TimeSyncResponse } from '../api/socket';

type TimeSyncCallback = (response: TimeSyncResponse) => void;
type EmitImpl = (
  payload: { clientSentAt: number },
  cb: TimeSyncCallback,
) => void;

class FakeRoomSocket {
  emitImpl: EmitImpl = () => {};

  emit(_event: 'time:sync', payload: { clientSentAt: number }, cb: TimeSyncCallback) {
    this.emitImpl(payload, cb);
  }

  on() {}

  off() {}

  asRoomSocket(): RoomSocket {
    return this as unknown as RoomSocket;
  }
}

describe('useServerClockOffset', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('socket이 없으면 offset은 0으로 유지된다', () => {
    const { result } = renderHook(() => useServerClockOffset(null));

    expect(result.current).toBe(0);
  });

  it('RTT가 가장 작은 샘플의 offset을 채택한다', async () => {
    const rtts = [50, 10, 80, 120, 60, 10, 200, 90];
    const offsets = [111, 222, 333, 444, 555, 666, 777, 888];
    const dateQueue: number[] = [];
    rtts.forEach((rtt, i) => {
      const sent = i * 1000;
      dateQueue.push(sent, sent + rtt);
    });
    vi.spyOn(Date, 'now').mockImplementation(() => dateQueue.shift() ?? 0);

    let sampleIndex = 0;
    const fakeSocket = new FakeRoomSocket();
    fakeSocket.emitImpl = (payload, cb) => {
      const i = sampleIndex;
      sampleIndex += 1;
      const rtt = rtts[i];
      cb({ serverTime: payload.clientSentAt + rtt / 2 + offsets[i] });
    };

    const { result } = renderHook(() =>
      useServerClockOffset(fakeSocket.asRoomSocket()),
    );

    // rtt가 가장 작은 index 1(rtt=10)이 채택되어야 한다 (index 5도 rtt=10이지만 먼저 나온 index 1을 유지).
    await waitFor(() => expect(result.current).toBe(offsets[1]));
  });

  it('ack 타임아웃된 샘플은 채택 대상에서 제외한다', async () => {
    vi.useFakeTimers();
    const dateQueue = [1000, 1010, 2000, 3000, 4000, 5000, 6000, 7000, 8000];
    vi.spyOn(Date, 'now').mockImplementation(() => dateQueue.shift() ?? 0);

    let callCount = 0;
    const fakeSocket = new FakeRoomSocket();
    fakeSocket.emitImpl = (payload, cb) => {
      callCount += 1;
      if (callCount === 1) {
        // 유일하게 ack가 도착하는 샘플: sent=1000, received=1010 -> rtt=10
        cb({ serverTime: payload.clientSentAt + 5 + 11340 });
      }
      // 나머지 7개는 ack 없이 방치되어 타임아웃된다.
    };

    const { result } = renderHook(() =>
      useServerClockOffset(fakeSocket.asRoomSocket()),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(result.current).toBe(11340);
  });
});
