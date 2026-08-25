import { useEffect, useMemo, useState, type FormEvent } from 'react';
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
  const { nickname, setNickname, isAuthenticated, isInitialized, logout } =
    useSession();
  const navigate = useNavigate();
  useGuestNicknameFallback();

  const [rooms, setRooms] = useState<RoomItemDto[]>([]);
  const [joiningRoomId, setJoiningRoomId] = useState<string | null>(null);
  const [isJoinPreparingAd, setIsJoinPreparingAd] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [adEnabled, setAdEnabled] = useState(false);
  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [passwordPromptRoom, setPasswordPromptRoom] =
    useState<RoomItemDto | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

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

  const handleNicknameSave = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = nicknameDraft.trim();
    if (!trimmed) {
      return;
    }
    setNickname(trimmed);
    setEditingNickname(false);
  };

  const handleCreateClick = () => {
    if (!isInitialized) {
      return;
    }
    if (!nickname) {
      navigate('/');
      return;
    }
    navigate('/rooms/new');
  };

  const runJoin = async (
    roomId: string,
    password: string | undefined,
    onError: (message: string) => void,
  ): Promise<boolean> => {
    try {
      const result = await joinRoom(roomId, { nickname, password });
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
      return true;
    } catch (err) {
      onError(
        err instanceof ApiError ? err.message : '방 입장에 실패했습니다.',
      );
      return false;
    }
  };

  const handleJoin = (roomId: string) => {
    if (!isInitialized) {
      return;
    }
    if (!nickname) {
      navigate('/');
      return;
    }

    const room = rooms.find((r) => r.roomId === roomId);
    if (room?.isPrivate) {
      setPasswordPromptRoom(room);
      setPasswordInput('');
      setPasswordError(null);
      return;
    }

    setJoiningRoomId(roomId);
    setListError(null);

    const doJoin = async () => {
      setIsJoinPreparingAd(false);
      await runJoin(roomId, undefined, setListError);
      setJoiningRoomId(null);
    };

    if (!adEnabled) {
      doJoin();
      return;
    }
    setIsJoinPreparingAd(true);
    setTimeout(doJoin, JOIN_AD_DELAY_MS);
  };

  const handlePasswordSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!passwordPromptRoom || passwordSubmitting) {
      return;
    }
    setPasswordSubmitting(true);
    setPasswordError(null);
    const succeeded = await runJoin(
      passwordPromptRoom.roomId,
      passwordInput,
      setPasswordError,
    );
    setPasswordSubmitting(false);
    if (succeeded) {
      setPasswordPromptRoom(null);
    }
  };

  return (
    <div className="min-h-screen px-4 py-8 sm:px-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <Logo size="md" to="/rooms" />
          <div className="flex flex-col items-end gap-1">
            {editingNickname ? (
              <form
                onSubmit={handleNicknameSave}
                className="flex items-center gap-1.5"
              >
                <input
                  autoFocus
                  value={nicknameDraft}
                  onChange={(event) => setNicknameDraft(event.target.value)}
                  maxLength={30}
                  className="w-28 rounded-full border border-purple-200 bg-purple-50/60 px-3 py-1 text-xs text-slate-700 outline-none focus:border-purple-400"
                />
                <button
                  type="submit"
                  disabled={!nicknameDraft.trim()}
                  className="rounded-full bg-purple-500 px-3 py-1 text-xs font-semibold text-white transition hover:bg-purple-600 disabled:bg-slate-200 disabled:text-slate-400"
                >
                  저장
                </button>
                <button
                  type="button"
                  onClick={() => setEditingNickname(false)}
                  className="text-xs text-slate-400 hover:text-slate-500"
                >
                  취소
                </button>
              </form>
            ) : nickname && !isAuthenticated ? (
              <button
                type="button"
                onClick={() => {
                  setNicknameDraft(nickname);
                  setEditingNickname(true);
                }}
                title="클릭해서 닉네임 수정"
                className="group flex items-center gap-1 text-sm font-medium text-slate-600 transition hover:text-purple-600"
              >
                <span className="underline decoration-dotted decoration-slate-300 underline-offset-2 group-hover:decoration-purple-400">
                  {nickname}님 환영합니다
                </span>
                <span className="text-xs text-slate-300 transition group-hover:text-purple-400">
                  ✏️
                </span>
              </button>
            ) : nickname ? (
              <span className="text-sm font-medium text-slate-600">
                {nickname}님 환영합니다
              </span>
            ) : (
              <button
                type="button"
                onClick={() => navigate('/')}
                className="text-sm text-slate-500 underline decoration-dotted underline-offset-2 hover:text-purple-500"
              >
                닉네임 등록하기
              </button>
            )}

            <div className="flex items-center gap-2 text-xs text-slate-400">
              <button
                type="button"
                onClick={() => setShowHelp(true)}
                className="transition hover:text-purple-500"
              >
                게임 방법
              </button>
              {isAuthenticated && (
                <>
                  <span className="text-slate-200">·</span>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await logout();
                        navigate('/');
                      } catch {
                        setListError(
                          '로그아웃에 실패했습니다. 잠시 후 다시 시도해 주세요.',
                        );
                      }
                    }}
                    className="transition hover:text-purple-500"
                  >
                    로그아웃
                  </button>
                </>
              )}
            </div>
          </div>
        </header>

        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-slate-700">방 목록</h1>
          <button
            type="button"
            onClick={handleCreateClick}
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
            <div className="flex flex-col items-center gap-3 rounded-2xl bg-white/60 px-5 py-12 text-center">
              <span className="text-3xl">🎤</span>
              <p className="text-sm font-semibold text-slate-500">
                아직 열린 방이 없어요
              </p>
              <p className="text-xs text-slate-400">
                새 방을 만들어 친구들을 초대해보세요.
              </p>
              <button
                type="button"
                onClick={handleCreateClick}
                disabled={!isInitialized}
                className="mt-1 rounded-full bg-purple-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-purple-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
              >
                + 새 방 만들기
              </button>
            </div>
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

      {passwordPromptRoom && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-xs rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-1 text-base font-bold text-slate-800">
              🔒 비밀번호가 필요해요
            </h2>
            <p className="mb-4 text-sm text-slate-500">
              {passwordPromptRoom.roomTtl}
            </p>
            <form
              onSubmit={handlePasswordSubmit}
              className="flex flex-col gap-2"
            >
              <input
                autoFocus
                type="text"
                value={passwordInput}
                onChange={(event) => setPasswordInput(event.target.value)}
                maxLength={50}
                placeholder="비밀번호"
                className="rounded-xl border border-slate-200 px-4 py-2.5 outline-none focus:border-purple-300"
              />
              {passwordError && (
                <p className="text-sm text-rose-500">{passwordError}</p>
              )}
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPasswordPromptRoom(null)}
                  className="rounded-full px-5 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={passwordSubmitting || !passwordInput}
                  className="rounded-full bg-purple-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-purple-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                >
                  {passwordSubmitting ? '입장 중...' : '입장하기'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showHelp && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-base font-bold text-slate-800">
              게임 방법
            </h2>
            <ul className="flex flex-col gap-3 text-sm text-slate-600">
              <li className="flex items-start gap-2.5">
                <span className="shrink-0">💬</span>
                <span>정답은 채팅창에 입력해서 맞혀요.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="shrink-0">⏱️</span>
                <span>한 라운드는 최대 30초 동안 진행돼요.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="shrink-0">🏆</span>
                <span>
                  맞힌 순서에 따라 6점, 4점, 3점, 이후 전원 1점을 받아요.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="shrink-0">⏭️</span>
                <span>참가자 과반수가 스킵을 누르면 라운드가 종료돼요.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="shrink-0">⚡</span>
                <span>
                  스피드 모드에서는 첫 정답자가 나오면 6초 뒤 정답이
                  공개되고, 4초 뒤 자동으로 다음 라운드로 넘어가요.
                </span>
              </li>
            </ul>
            <button
              type="button"
              onClick={() => setShowHelp(false)}
              className="mt-5 w-full rounded-full bg-purple-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-purple-600"
            >
              확인
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
