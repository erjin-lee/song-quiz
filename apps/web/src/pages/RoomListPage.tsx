import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdBanner } from '../components/AdBanner';
import { Logo } from '../components/Logo';
import { RoomActionOverlay } from '../components/RoomActionOverlay';
import { RoomCard } from '../components/RoomCard';
import { useSession } from '../context/SessionContext';
import { useDocumentMeta } from '../hooks/useDocumentMeta';
import { useGuestNicknameFallback } from '../hooks/useGuestNicknameFallback';
import { ApiError } from '../api/client';
import { getAdConfig } from '../api/config';
import { getRooms, joinRoom } from '../api/room';
import { saveRoomSession } from '../utils/roomSession';
import type { RoomItemDto } from '../types/room';

const ADSENSE_SLOT_ROOM_LIST = import.meta.env.VITE_ADSENSE_SLOT_ROOM_LIST;

const ROOM_LIST_POLL_MS = 5000;
const JOIN_AD_DELAY_MS = 3000;

export function RoomListPage() {
  const { nickname, isAuthenticated, isInitialized, logout } = useSession();
  const navigate = useNavigate();
  useGuestNicknameFallback();

  const [rooms, setRooms] = useState<RoomItemDto[]>([]);
  const [joiningRoomId, setJoiningRoomId] = useState<string | null>(null);
  const [isJoinPreparingAd, setIsJoinPreparingAd] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [adEnabled, setAdEnabled] = useState(false);

  useDocumentMeta({
    title: '방 목록 | 노래맞히기',
    description:
      '지금 열려 있는 노래맞히기 방 목록을 확인하고 친구들과 함께 실시간으로 참여해보세요.',
  });

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

  const handleJoin = (roomId: string) => {
    if (!isInitialized) {
      return;
    }
    if (!nickname) {
      navigate('/');
      return;
    }

    setJoiningRoomId(roomId);
    setListError(null);

    const doJoin = async () => {
      setIsJoinPreparingAd(false);
      try {
        const result = await joinRoom(roomId, { nickname });
        saveRoomSession({
          roomId,
          userId: result.userId,
          accessToken: result.accessToken,
        });
        navigate(`/rooms/${roomId}`, {
          state: {
            room: result.room,
            userId: result.userId,
            accessToken: result.accessToken,
          },
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
          <span className="flex items-center gap-2 text-sm text-slate-500">
            {nickname ? (
              `${nickname}님 환영합니다`
            ) : (
              <button
                type="button"
                onClick={() => navigate('/')}
                className="underline decoration-dotted underline-offset-2 hover:text-purple-500"
              >
                닉네임 등록하기
              </button>
            )}
            {isAuthenticated && (
              <button
                type="button"
                onClick={() => {
                  logout();
                  navigate('/');
                }}
                className="underline decoration-dotted underline-offset-2 hover:text-purple-500"
              >
                로그아웃
              </button>
            )}
          </span>
        </header>

        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-slate-700">방 목록</h1>
          <button
            type="button"
            onClick={() => {
              if (!isInitialized) {
                return;
              }
              if (!nickname) {
                navigate('/');
                return;
              }
              navigate('/rooms/new');
            }}
            disabled={!isInitialized}
            className="rounded-full bg-purple-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-purple-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
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
              disabled={!isInitialized}
              onJoin={() => handleJoin(room.roomId)}
            />
          ))}
        </div>

        <div className="flex justify-center">
          <AdBanner slotId={ADSENSE_SLOT_ROOM_LIST} />
        </div>
      </div>

      {isJoinPreparingAd && (
        <RoomActionOverlay message="방에 입장하는 중입니다..." />
      )}
    </div>
  );
}
