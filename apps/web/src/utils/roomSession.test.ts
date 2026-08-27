import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearRoomSession,
  loadRoomSession,
  saveRoomSession,
  type RoomSession,
} from './roomSession';

const SESSION: RoomSession = {
  roomId: 'room-1',
  userId: 'user-1',
  accessToken: 'token-1',
};

describe('roomSession', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('저장한 세션을 그대로 불러온다', () => {
    saveRoomSession(SESSION);

    expect(loadRoomSession()).toEqual(SESSION);
  });

  it('저장된 값이 없으면 null을 반환한다', () => {
    expect(loadRoomSession()).toBeNull();
  });

  it('손상된 JSON이 저장되어 있으면 null을 반환한다', () => {
    localStorage.setItem('song-quiz:room-session', '{invalid-json');

    expect(loadRoomSession()).toBeNull();
  });

  it('필수 필드가 누락되면 null을 반환한다', () => {
    localStorage.setItem(
      'song-quiz:room-session',
      JSON.stringify({ roomId: 'room-1' }),
    );

    expect(loadRoomSession()).toBeNull();
  });

  it('clearRoomSession 호출 후에는 세션을 불러올 수 없다', () => {
    saveRoomSession(SESSION);

    clearRoomSession();

    expect(loadRoomSession()).toBeNull();
  });
});
