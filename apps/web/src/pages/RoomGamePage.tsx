import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { ParticipantList } from '../components/ParticipantList';
import { GamePlayer } from '../components/GamePlayer';
import {
  ChatPanel,
  type ChatEntry,
  type ChatPanelHandle,
} from '../components/ChatPanel';
import { getRoomById, leaveRoom } from '../api/room';
import { getQuizSongCount } from '../api/quiz';
import { createRoomSocket, type RoomSocket } from '../api/socket';
import { useServerClockOffset } from '../hooks/useServerClockOffset';
import {
  clearRoomSession,
  loadRoomSession,
  saveRoomSession,
} from '../utils/roomSession';
import { sortParticipantsByScore } from '../utils/participants';
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
  const [nextRoundShortcutEnabled, setNextRoundShortcutEnabled] =
    useState(true);
  const chatPanelRef = useRef<ChatPanelHandle>(null);
  const [socket, setSocket] = useState<RoomSocket | null>(null);
  const serverTimeOffsetMs = useServerClockOffset(socket);

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
    setSocket(socket);

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
      setSocket(null);
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

  // 아래 핸들러들은 GamePlayer 내부 effect의 의존성으로 전달된다(onReady는 LOADING
  // 무한정지 방지용 fallback 타이머, onNextRound는 Shift+→ 단축키 리스너). 매 렌더마다
  // 새 함수를 만들면 그 effect들이 room:state 브로드캐스트가 올 때마다 불필요하게
  // 재실행/재설정된다(예: fallback 타이머가 계속 리셋되어 결코 발화하지 않는 문제).
  // socket이 실제로 바뀔 때만 참조가 바뀌도록 useCallback으로 안정화한다.
  // handleLeave는 room/userId를 참조하지만, Hooks 규칙상 아래 얼리 리턴보다 먼저
  // 선언해야 하므로 내부에서 null을 다시 확인한다(실제로는 얼리 리턴 이후에만 렌더되는
  // JSX에서 호출되므로 항상 non-null이다).
  const handleLeave = useCallback(async () => {
    if (!room || !userId) {
      return;
    }
    try {
      await leaveRoom(room.roomId, userId);
    } finally {
      clearRoomSession();
      navigate('/rooms', { replace: true });
    }
  }, [room, userId, navigate]);

  const handleSendChat = useCallback(
    (message: string) => {
      socket?.emit('chat:message', { message });
    },
    [socket],
  );

  const handleStartGame = useCallback(() => {
    socket?.emit('game:start');
  }, [socket]);

  const handleGameReady = useCallback(() => {
    socket?.emit('game:ready');
  }, [socket]);

  const handleNextRound = useCallback(() => {
    socket?.emit('game:next-round');
    // 단축키(Shift+N) 입력이 채팅창에 문자로 반영됐을 가능성에 대비해 초기화한다.
    chatPanelRef.current?.clearDraft();
    chatPanelRef.current?.focus();
  }, [socket]);

  const handleSkip = useCallback(() => {
    socket?.emit('game:skip');
  }, [socket]);

  const handleForceSkip = useCallback(() => {
    socket?.emit('game:force-skip');
  }, [socket]);

  if (!room || !userId) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">
        {loading ? '방 정보를 불러오는 중...' : null}
      </div>
    );
  }

  const isNextRoundShortcutActive =
    room.hostUserId === userId &&
    room.gameStatus === 'ROUND_ENDED' &&
    nextRoundShortcutEnabled;

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
          <aside className="max-h-[40vh] overflow-y-auto pr-1 sm:max-h-[55vh] lg:max-h-[calc(100vh-11rem)]">
            <ParticipantList
              participants={
                room.gameStatus === 'WAITING'
                  ? room.participants
                  : sortParticipantsByScore(room.participants)
              }
              hostUserId={room.hostUserId}
              currentUserId={userId}
              maxUserCnt={room.maxUserCnt}
            />
          </aside>

          <main className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm">
            <GamePlayer
              room={room}
              myUserId={userId}
              serverTimeOffsetMs={serverTimeOffsetMs}
              onStartGame={handleStartGame}
              onReady={handleGameReady}
              onNextRound={handleNextRound}
              onSkip={handleSkip}
              onForceSkip={handleForceSkip}
              shortcutEnabled={nextRoundShortcutEnabled}
              onShortcutEnabledChange={setNextRoundShortcutEnabled}
            />

            <div className="flex flex-col gap-2 border-t border-slate-100 pt-4">
              <ChatPanel
                ref={chatPanelRef}
                entries={chatEntries}
                onSend={handleSendChat}
                blockNextRoundShortcutKey={isNextRoundShortcutActive}
              />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
