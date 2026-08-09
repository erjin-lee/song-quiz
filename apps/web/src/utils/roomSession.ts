const ROOM_SESSION_STORAGE_KEY = 'song-quiz:room-session';

export interface RoomSession {
  roomId: string;
  userId: string;
}

export function saveRoomSession(session: RoomSession): void {
  localStorage.setItem(ROOM_SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function loadRoomSession(): RoomSession | null {
  const raw = localStorage.getItem(ROOM_SESSION_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.roomId === 'string' &&
      typeof parsed?.userId === 'string'
    ) {
      return parsed as RoomSession;
    }
  } catch {
    // 저장된 값이 손상된 경우 무시하고 null 처리한다.
  }
  return null;
}

export function clearRoomSession(): void {
  localStorage.removeItem(ROOM_SESSION_STORAGE_KEY);
}
