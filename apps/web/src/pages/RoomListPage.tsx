import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdBanner } from '../components/AdBanner';
import { Logo } from '../components/Logo';
import { RoomActionOverlay } from '../components/RoomActionOverlay';
import { RoomCard } from '../components/RoomCard';
import {
  CreateRoomModal,
  type CreateRoomFormValues,
} from '../components/CreateRoomModal';
import { useSession } from '../context/SessionContext';
import { ApiError } from '../api/client';
import { getAdConfig } from '../api/config';
import { getQuizzes } from '../api/quiz';
import { createRoom, getRooms, joinRoom } from '../api/room';
import { saveRoomSession } from '../utils/roomSession';
import type { QuizListItemDto } from '../types/quiz';
import type { RoomItemDto } from '../types/room';

const ADSENSE_SLOT_ROOM_LIST = import.meta.env.VITE_ADSENSE_SLOT_ROOM_LIST;

const ROOM_LIST_POLL_MS = 5000;
const JOIN_AD_DELAY_MS = 3000;

export function RoomListPage() {
  const { nickname } = useSession();
  const navigate = useNavigate();

  const [rooms, setRooms] = useState<RoomItemDto[]>([]);
  const [quizzes, setQuizzes] = useState<QuizListItemDto[]>([]);
  const [isCreateModalOpen, setCreateModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [joiningRoomId, setJoiningRoomId] = useState<string | null>(null);
  const [isJoinPreparingAd, setIsJoinPreparingAd] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [adEnabled, setAdEnabled] = useState(false);

  useEffect(() => {
    if (!nickname) {
      navigate('/', { replace: true });
    }
  }, [nickname, navigate]);

  useEffect(() => {
    let cancelled = false;

    const fetchRooms = async () => {
      try {
        const data = await getRooms();
        if (!cancelled) {
          setRooms(data);
          setListError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setListError(
            err instanceof ApiError ? err.message : '방 목록을 불러오지 못했습니다.',
          );
        }
      }
    };

    fetchRooms();
    const interval = setInterval(fetchRooms, ROOM_LIST_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    getQuizzes()
      .then(setQuizzes)
      .catch(() => setQuizzes([]));
  }, []);

  useEffect(() => {
    getAdConfig()
      .then((config) => setAdEnabled(config.adEnabled))
      .catch(() => setAdEnabled(false));
  }, []);

  const filteredRooms = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    if (!keyword) {
      return rooms;
    }
    return rooms.filter((room) =>
      [room.roomTtl, room.quizTtl, ...room.atstNms].some((field) =>
        field.toLowerCase().includes(keyword),
      ),
    );
  }, [rooms, searchQuery]);

  const handleCreate = async (values: CreateRoomFormValues) => {
    setCreating(true);
    setCreateError(null);
    try {
      const result = await createRoom({ ...values, nickname });
      saveRoomSession({ roomId: result.room.roomId, userId: result.userId });
      navigate(`/rooms/${result.room.roomId}`, {
        state: { room: result.room, userId: result.userId },
      });
    } catch (err) {
      setCreateError(
        err instanceof ApiError ? err.message : '방 생성에 실패했습니다.',
      );
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = (roomId: string) => {
    setJoiningRoomId(roomId);
    setListError(null);

    const doJoin = async () => {
      setIsJoinPreparingAd(false);
      try {
        const result = await joinRoom(roomId, { nickname });
        saveRoomSession({ roomId, userId: result.userId });
        navigate(`/rooms/${roomId}`, {
          state: { room: result.room, userId: result.userId },
        });
      } catch (err) {
        setListError(
          err instanceof ApiError ? err.message : '방 입장에 실패했습니다.',
        );
      } finally {
        setJoiningRoomId(null);
      }
    };

    if (!adEnabled) {
      doJoin();
      return;
    }
    setIsJoinPreparingAd(true);
    setTimeout(doJoin, JOIN_AD_DELAY_MS);
  };

  return (
    <div className="min-h-screen px-4 py-8 sm:px-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header className="flex items-center justify-between">
          <Logo size="md" />
          <span className="text-sm text-slate-500">{nickname}님 환영합니다</span>
        </header>

        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-slate-700">방 목록</h1>
          <button
            type="button"
            onClick={() => setCreateModalOpen(true)}
            className="rounded-full bg-purple-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-purple-600"
          >
            + 새 방 만들기
          </button>
        </div>

        {listError && <p className="text-sm text-rose-500">{listError}</p>}

        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="방 제목, 퀴즈, 가수로 검색"
          className="w-full rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-purple-400"
        />

        <div className="flex flex-col gap-3">
          {rooms.length === 0 && (
            <p className="rounded-2xl bg-white/60 px-5 py-10 text-center text-sm text-slate-400">
              아직 열린 방이 없어요. 새 방을 만들어보세요.
            </p>
          )}
          {rooms.length > 0 && filteredRooms.length === 0 && (
            <p className="rounded-2xl bg-white/60 px-5 py-10 text-center text-sm text-slate-400">
              검색 결과가 없어요.
            </p>
          )}
          {filteredRooms.map((room) => (
            <RoomCard
              key={room.roomId}
              room={room}
              joining={joiningRoomId === room.roomId}
              onJoin={() => handleJoin(room.roomId)}
            />
          ))}
        </div>

        <div className="flex justify-center">
          <AdBanner slotId={ADSENSE_SLOT_ROOM_LIST} />
        </div>
      </div>

      {isCreateModalOpen && (
        <CreateRoomModal
          quizzes={quizzes}
          submitting={creating}
          errorMessage={createError}
          adEnabled={adEnabled}
          onSubmit={handleCreate}
          onClose={() => setCreateModalOpen(false)}
        />
      )}

      {isJoinPreparingAd && (
        <RoomActionOverlay message="방에 입장하는 중입니다..." />
      )}
    </div>
  );
}
