import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { ParticipantList } from '../components/ParticipantList';
import { PlayerCard } from '../components/PlayerCard';
import { ChatPanel, type ChatEntry } from '../components/ChatPanel';
import { useSession } from '../context/SessionContext';
import { leaveRoom } from '../api/room';
import { getQuizSongCount } from '../api/quiz';
import { createRoomSocket, type RoomSocket } from '../api/socket';
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
  const { nickname } = useSession();

  const state = location.state as LocationState | null;

  const [room, setRoom] = useState<RoomItemDto | null>(state?.room ?? null);
  const [chatEntries, setChatEntries] = useState<ChatEntry[]>([]);
  const [songCount, setSongCount] = useState<number | null>(null);
  const socketRef = useRef<RoomSocket | null>(null);

  useEffect(() => {
    if (!nickname || !state || !roomId) {
      navigate('/rooms', { replace: true });
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

    socket.on('room:participants-updated', (payload) => {
      setRoom((prev) =>
        prev
          ? {
              ...prev,
              participants: payload.participants,
              curUserCnt: payload.participants.length,
            }
          : prev,
      );
    });

    socket.on('room:error', (payload) => {
      setChatEntries((prev) => [
        ...prev,
        { id: nextEntryId(), type: 'system', message: payload.message },
      ]);
    });

    socket.connect();
    socket.emit('room:enter', { roomId, userId: state.userId });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const quizId = room?.quizId;
  useEffect(() => {
    if (!quizId) {
      return;
    }
    getQuizSongCount(quizId)
      .then(setSongCount)
      .catch(() => setSongCount(null));
  }, [quizId]);

  if (!room || !state) {
    return null;
  }

  const handleLeave = async () => {
    try {
      await leaveRoom(room.roomId, state.userId);
    } finally {
      navigate('/rooms', { replace: true });
    }
  };

  const handleSendChat = (message: string) => {
    socketRef.current?.emit('chat:message', { message });
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
              currentUserId={state.userId}
              maxUserCnt={room.maxUserCnt}
            />
          </aside>

          <main className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm">
            <PlayerCard />

            <div className="flex flex-col gap-2 border-t border-slate-100 pt-4">
              <ChatPanel entries={chatEntries} onSend={handleSendChat} />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
