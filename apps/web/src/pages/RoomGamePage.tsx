import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { ParticipantList } from '../components/ParticipantList';
import { GamePlayer } from '../components/GamePlayer';
import { ChatPanel, type ChatEntry } from '../components/ChatPanel';
import { getRoomById, leaveRoom } from '../api/room';
import { getQuizSongCount } from '../api/quiz';
import { createRoomSocket, type RoomSocket } from '../api/socket';
import {
  clearRoomSession,
  loadRoomSession,
  saveRoomSession,
} from '../utils/roomSession';
import type { RoomItemDto } from '../types/room';

interface LocationState {
  room: RoomItemDto;
  userId: string;
}

let entrySeq = 0;
const nextEntryId = () => `entry-${entrySeq++}`;

export function RoomGamePage() {
  const { roomId } = useParams<{ roomId: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const state = location.state as LocationState | null;

  const [room, setRoom] = useState<RoomItemDto | null>(state?.room ?? null);
  const [userId, setUserId] = useState<string | null>(state?.userId ?? null);
  const [loading, setLoading] = useState(true);
  const [chatEntries, setChatEntries] = useState<ChatEntry[]>([]);
  const [songCount, setSongCount] = useState<number | null>(null);
  const socketRef = useRef<RoomSocket | null>(null);

  // 방 상태를 서버에서 최신으로 확인/복구한다. 새로고침으로 location.state가
  // 사라진 경우 로컬스토리지에 저장해둔 { roomId, userId }로 이어서 입장한다.
  useEffect(() => {
    if (!roomId) {
      navigate('/rooms', { replace: true });
      return;
    }

    const candidateUserId =
      state?.userId ??
      (() => {
        const session = loadRoomSession();
        return session && session.roomId === roomId ? session.userId : null;
      })();

    if (!candidateUserId) {
      navigate('/rooms', { replace: true });
      return;
    }

    let cancelled = false;

    getRoomById(roomId)
      .then((fetchedRoom) => {
        if (cancelled) {
          return;
        }
        const isParticipant = fetchedRoom.participants.some(
          (participant) => participant.userId === candidateUserId,
        );
        if (!isParticipant) {
          clearRoomSession();
          navigate('/rooms', { replace: true });
          return;
        }

        saveRoomSession({ roomId, userId: candidateUserId });
        setRoom(fetchedRoom);
        setUserId(candidateUserId);
      })
      .catch(() => {
        if (!cancelled) {
          clearRoomSession();
          navigate('/rooms', { replace: true });
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  useEffect(() => {
    if (!roomId || !userId) {
      return;
    }

    const socket = createRoomSocket();
    socketRef.current = socket;

    socket.on('chat:message', (payload) => {
      setChatEntries((prev) => [
        ...prev,
        {
          id: nextEntryId(),
          type: 'message',
          nickname: payload.nickname,
          message: payload.message,
        },
      ]);
    });

    socket.on('chat:system', (payload) => {
      setChatEntries((prev) => [
        ...prev,
        { id: nextEntryId(), type: 'system', message: payload.message },
      ]);
    });

    socket.on('room:state', (updatedRoom) => {
      setRoom(updatedRoom);
    });

    socket.on('room:error', (payload) => {
      setChatEntries((prev) => [
        ...prev,
        { id: nextEntryId(), type: 'system', message: payload.message },
      ]);
    });

    socket.connect();
    socket.emit('room:enter', { roomId, userId });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [roomId, userId]);

  const quizId = room?.quizId;
  useEffect(() => {
    if (!quizId) {
      return;
    }
    getQuizSongCount(quizId)
      .then(setSongCount)
      .catch(() => setSongCount(null));
  }, [quizId]);

  if (!room || !userId) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">
        {loading ? '방 정보를 불러오는 중...' : null}
      </div>
    );
  }

  const handleLeave = async () => {
    try {
      await leaveRoom(room.roomId, userId);
    } finally {
      clearRoomSession();
      navigate('/rooms', { replace: true });
    }
  };

  const handleSendChat = (message: string) => {
    socketRef.current?.emit('chat:message', { message });
  };

  const handleStartGame = () => {
    socketRef.current?.emit('game:start');
  };

  const handleGameReady = () => {
    socketRef.current?.emit('game:ready');
  };

  const handlePlay = () => {
    socketRef.current?.emit('game:play');
  };

  const handleNextRound = () => {
    socketRef.current?.emit('game:next-round');
  };

  return (
    <div className="min-h-screen px-4 py-8 sm:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Logo size="md" />
            <span className="rounded-full bg-white px-4 py-1.5 text-sm font-medium text-slate-600 shadow-sm">
              {room.roomTtl}
            </span>
          </div>
          <button
            type="button"
            onClick={handleLeave}
            className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-slate-500 shadow-sm hover:bg-slate-50"
          >
            나가기
          </button>
        </header>

        <div className="flex items-center justify-between rounded-2xl bg-white px-5 py-3 text-sm text-slate-500 shadow-sm">
          <span>{room.quizTtl}</span>
          <span>{songCount !== null ? `총 출제곡 ${songCount}곡` : ''}</span>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr]">
          <aside>
            <ParticipantList
              participants={room.participants}
              hostUserId={room.hostUserId}
              currentUserId={userId}
              maxUserCnt={room.maxUserCnt}
            />
          </aside>

          <main className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm">
            <GamePlayer
              room={room}
              myUserId={userId}
              onStartGame={handleStartGame}
              onReady={handleGameReady}
              onPlay={handlePlay}
              onNextRound={handleNextRound}
            />

            <div className="flex flex-col gap-2 border-t border-slate-100 pt-4">
              <ChatPanel entries={chatEntries} onSend={handleSendChat} />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
