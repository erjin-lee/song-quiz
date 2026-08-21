import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { ParticipantList } from '../components/ParticipantList';
import { GamePlayer } from '../components/GamePlayer';
import { InquiryModal } from '../components/InquiryModal';
import { EditRoomModal } from '../components/EditRoomModal';
import { ChangeNicknameModal } from '../components/ChangeNicknameModal';
import {
  ChatPanel,
  type ChatEntry,
  type ChatPanelHandle,
} from '../components/ChatPanel';
import { ApiError } from '../api/client';
import { getRoomById, joinRoom, leaveRoom } from '../api/room';
import { createRoomSocket, type RoomSocket } from '../api/socket';
import { useServerClockOffset } from '../hooks/useServerClockOffset';
import { useDocumentMeta } from '../hooks/useDocumentMeta';
import { useGuestNicknameFallback } from '../hooks/useGuestNicknameFallback';
import { useSession } from '../context/SessionContext';
import {
  clearRoomSession,
  loadRoomSession,
  saveRoomSession,
} from '../utils/roomSession';
import { playCorrectAnswerSound } from '../utils/sound';
import { isDebugUser, truncateForDebugChat } from '../utils/debugUser';
import type { RoomItemDto } from '../types/room';
import type {
  PlaybackStartedDetails,
  PlaybackTriggeredDetails,
} from '../components/GamePlayer';

interface LocationState {
  room: RoomItemDto;
  userId: string;
  accessToken: string;
}

interface RoomMembership {
  userId: string;
  accessToken: string;
}

let entrySeq = 0;
const nextEntryId = () => `entry-${entrySeq++}`;

/** 짧은 네트워크 hiccup으로 소켓이 잠깐 끊겼다가 곧바로 재연결되는 경우까지
 * "연결이 끊어졌습니다" 안내를 띄우면 사용자를 불필요하게 불안하게 만든다. */
const DISCONNECT_NOTICE_DELAY_MS = 800;

export function RoomGamePage() {
  const { roomId } = useParams<{ roomId: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const state = location.state as LocationState | null;

  const [room, setRoom] = useState<RoomItemDto | null>(state?.room ?? null);
  const [userId, setUserId] = useState<string | null>(state?.userId ?? null);
  const [accessToken, setAccessToken] = useState<string | null>(
    state?.accessToken ?? null,
  );
  const [loading, setLoading] = useState(true);
  const [chatEntries, setChatEntries] = useState<ChatEntry[]>([]);
  const [nextRoundShortcutEnabled, setNextRoundShortcutEnabled] =
    useState(true);
  const [inquiryTarget, setInquiryTarget] = useState<{
    quizSongId: string;
    songNm: string;
    atstNm: string;
  } | null>(null);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [editRoomOpen, setEditRoomOpen] = useState(false);
  const [nicknameModalOpen, setNicknameModalOpen] = useState(false);
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const chatPanelRef = useRef<ChatPanelHandle>(null);
  const [socket, setSocket] = useState<RoomSocket | null>(null);
  const serverTimeOffsetMs = useServerClockOffset(socket);
  const { nickname, isInitialized, isAuthenticated, setNickname } =
    useSession();
  useGuestNicknameFallback();

  useDocumentMeta({
    title: room ? `${room.roomTtl} | 노래맞히기` : '게임 진행 중 | 노래맞히기',
    robots: 'noindex, follow',
  });
  // 디버그 이벤트 로그 발송 시 "서버 기준 현재 시각"을 계산하는 데 쓴다. onAny
  // 리스너는 소켓 생성 시 한 번만 등록되므로 offset 갱신 값을 최신으로 읽으려면
  // ref로 참조해야 한다(그렇지 않으면 등록 시점의 값에 고정된다).
  const serverTimeOffsetMsRef = useRef(serverTimeOffsetMs);
  useEffect(() => {
    serverTimeOffsetMsRef.current = serverTimeOffsetMs;
  }, [serverTimeOffsetMs]);

  // location.state로 넘어온 userId/accessToken이 없으면(새로고침 등) 로컬스토리지에
  // 저장해둔 { roomId, userId, accessToken }으로 이어서 입장한다. 둘 다 없으면
  // (공유 링크로 직접 들어온 경우) 아래 두 번째 effect가 닉네임 준비 후 자동으로
  // 방에 입장시킨다.
  const [candidateMembership, setCandidateMembership] =
    useState<RoomMembership | null>(() => {
      if (state?.userId && state?.accessToken) {
        return { userId: state.userId, accessToken: state.accessToken };
      }
      const session = loadRoomSession();
      return session && session.roomId === roomId
        ? { userId: session.userId, accessToken: session.accessToken }
        : null;
    });

  useEffect(() => {
    if (state?.userId && state?.accessToken) {
      setCandidateMembership({
        userId: state.userId,
        accessToken: state.accessToken,
      });
      return;
    }
    const session = loadRoomSession();
    setCandidateMembership(
      session && session.roomId === roomId
        ? { userId: session.userId, accessToken: session.accessToken }
        : null,
    );
  }, [roomId, state?.userId, state?.accessToken]);

  useEffect(() => {
    if (!roomId) {
      navigate('/rooms', { replace: true });
      return;
    }

    if (!candidateMembership) {
      return;
    }

    let cancelled = false;

    getRoomById(roomId)
      .then((fetchedRoom) => {
        if (cancelled) {
          return;
        }
        const isParticipant = fetchedRoom.participants.some(
          (participant) => participant.userId === candidateMembership.userId,
        );
        if (!isParticipant) {
          // 서버에서는 이미 퇴장 처리됐지만 로컬 세션이 남아있던 경우다.
          // 방 목록으로 튕겨내지 않고, 아래 자동 입장 effect로 이어서
          // 새 참가자로 다시 입장시킨다.
          clearRoomSession();
          setCandidateMembership(null);
          return;
        }

        saveRoomSession({
          roomId,
          userId: candidateMembership.userId,
          accessToken: candidateMembership.accessToken,
        });
        setRoom(fetchedRoom);
        setUserId(candidateMembership.userId);
        setAccessToken(candidateMembership.accessToken);
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
  }, [roomId, candidateMembership]);

  // 참가 기록이 전혀 없는 직접 진입(공유 링크 등): 닉네임이 준비되는 대로
  // REST 입장을 호출해 게스트/로그인 유저 구분 없이 자동으로 방에 들어간다.
  useEffect(() => {
    if (!roomId || candidateMembership) {
      return;
    }
    if (!isInitialized || !nickname) {
      return;
    }

    let cancelled = false;

    joinRoom(roomId, { nickname })
      .then((result) => {
        if (cancelled) {
          return;
        }
        saveRoomSession({
          roomId,
          userId: result.userId,
          accessToken: result.accessToken,
        });
        setRoom(result.room);
        setUserId(result.userId);
        setAccessToken(result.accessToken);
      })
      .catch((err) => {
        if (cancelled) {
          return;
        }
        if (err instanceof ApiError && err.status === 401) {
          setPasswordRequired(true);
          return;
        }
        navigate('/rooms', { replace: true });
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [roomId, candidateMembership, nickname, isInitialized, navigate]);

  // 비밀방을 공유 링크로 직접 열었을 때(참가 기록 없음) 비밀번호를 입력받아 재시도한다.
  const handlePasswordSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      if (!roomId || passwordSubmitting) {
        return;
      }
      setPasswordSubmitting(true);
      setPasswordError(null);
      try {
        const result = await joinRoom(roomId, {
          nickname,
          password: passwordInput,
        });
        saveRoomSession({
          roomId,
          userId: result.userId,
          accessToken: result.accessToken,
        });
        setRoom(result.room);
        setUserId(result.userId);
        setAccessToken(result.accessToken);
        setPasswordRequired(false);
      } catch (err) {
        setPasswordError(
          err instanceof ApiError ? err.message : '입장에 실패했습니다.',
        );
      } finally {
        setPasswordSubmitting(false);
      }
    },
    [roomId, nickname, passwordInput, passwordSubmitting],
  );

  useEffect(() => {
    if (!roomId || !userId || !accessToken) {
      return;
    }

    const socket = createRoomSocket();
    setSocket(socket);

    // 끊김 안내는 즉시 띄우지 않고 DISCONNECT_NOTICE_DELAY_MS만큼 지연시킨다. 그 안에
    // 재연결되면(짧은 네트워크 hiccup) 안내를 아예 띄우지 않고, 안내가 실제로 뜬
    // 경우에만(disconnectNoticeShown) 복구 메시지도 함께 띄운다 — 끊긴 적 없다는
    // 사실을 사용자가 굳이 알 필요는 없다.
    let disconnectNoticeShown = false;
    let disconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let pendingReconnectNotice = false;

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

    // room:enter 성공 시 서버가 보관 중인 최근 채팅 히스토리를 내려준다. 새로고침으로
    // chatEntries가 초기화돼도 이걸로 복원된다(전체를 교체 — 최초 입장 시에도 다른
    // 유저들이 미리 나눈 채팅이 있으면 함께 보인다).
    // 재연결 직후에는 room:enter 응답으로 이 이벤트가 곧바로 뒤따라오므로, connect
    // 핸들러에서 append한 "복구되었습니다" 메시지가 여기서 덮어써진다. 그래서 복구
    // 안내는 여기서 pendingReconnectNotice 플래그를 확인해 교체 결과에 함께 붙인다.
    socket.on('chat:history', (entries) => {
      const mapped: ChatEntry[] = entries.map((entry) => ({
        id: nextEntryId(),
        ...entry,
      }));
      if (pendingReconnectNotice) {
        pendingReconnectNotice = false;
        mapped.push({
          id: nextEntryId(),
          type: 'system',
          message: '서버와의 연결이 복구되었습니다.',
        });
      }
      setChatEntries(mapped);
    });

    socket.on('room:state', (updatedRoom) => {
      setRoom(updatedRoom);
    });

    socket.on('room:error', (payload) => {
      // room:enter가 실패하면 chat:history가 오지 않아 pendingReconnectNotice가
      // 계속 true로 남을 수 있다. 이후 무관한 chat:history에 복구 메시지가 잘못
      // 붙는 걸 막기 위해 여기서 정리한다.
      pendingReconnectNotice = false;
      setChatEntries((prev) => [
        ...prev,
        { id: nextEntryId(), type: 'system', message: payload.message },
      ]);
    });

    socket.on('inquiry:result', (payload) => {
      setChatEntries((prev) => [
        ...prev,
        {
          id: nextEntryId(),
          type: 'system',
          message: `[문의 결과] ${payload.message}`,
        },
      ]);
    });

    // 동시 재생 디버깅용: 닉네임에 DEBUG_USER가 포함된 유저는 이 소켓이 받는 모든
    // 이벤트를 채팅으로도 발송해, 여러 클라이언트의 이벤트 수신 시점을 방 채팅
    // 로그(sentAt 타임스탬프 포함)로 비교할 수 있게 한다. chat:message는 이 로직이
    // 만든 디버그 메시지 자신도 다시 받게 되므로(서버가 방 전체에 echo), 무한 루프를
    // 막기 위해 로깅 대상에서 제외한다.
    if (isDebugUser(nickname)) {
      socket.onAny((event, ...args) => {
        if (event === 'chat:message') {
          return;
        }
        const payload = args.length <= 1 ? args[0] : args;
        const serverTimeIso = new Date(
          Date.now() + serverTimeOffsetMsRef.current,
        ).toISOString();
        socket.emit('chat:message', {
          message: truncateForDebugChat(
            `[DEBUG] event=${event} serverTimeAt=${serverTimeIso} payload=${JSON.stringify(payload)}`,
          ),
        });
      });
    }

    // 서버 재시작 등으로 소켓이 끊겼다가 자동 재연결되면 'connect'가 다시 발화된다.
    // 이때 room:enter를 재emit하지 않으면 서버의 disconnect-grace 타이머가 만료되어
    // 방에서 제거되고, room 멤버십도 복구되지 않는다. 복구 안내 메시지 자체는
    // chat:history 핸들러에서 pendingReconnectNotice로 붙인다.
    socket.on('connect', () => {
      if (disconnectTimer) {
        clearTimeout(disconnectTimer);
        disconnectTimer = null;
      }
      if (disconnectNoticeShown) {
        disconnectNoticeShown = false;
        pendingReconnectNotice = true;
      }
      socket.emit('room:enter', { roomId, userId, accessToken });
    });

    socket.on('disconnect', () => {
      disconnectTimer = setTimeout(() => {
        disconnectTimer = null;
        disconnectNoticeShown = true;
        setChatEntries((prev) => [
          ...prev,
          {
            id: nextEntryId(),
            type: 'system',
            message: '서버와의 연결이 끊어졌습니다. 재연결을 시도합니다...',
          },
        ]);
      }, DISCONNECT_NOTICE_DELAY_MS);
    });

    socket.connect();

    return () => {
      if (disconnectTimer) {
        clearTimeout(disconnectTimer);
      }
      socket.disconnect();
      setSocket(null);
    };
    // nickname은 최초 연결 시점의 디버그 모드 판별에만 쓴다. 방 안에서 닉네임을
    // 바꿨다고 소켓을 재연결하면 채팅/방 상태가 불필요하게 깜빡이므로 deps에서 뺀다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, userId, accessToken]);

  // 내가 방금 정답을 맞혔을 때만 효과음을 재생한다. room:state는 전체 라운드 상태를
  // 통째로 내려주므로, 이전에 내 userId가 없다가 새로 추가된 순간(전환)만 감지한다.
  // prevCorrectUserIdsRef가 null인 최초 렌더(새로고침 등으로 이미 맞춘 상태로 진입한
  // 경우 포함)에는 재생하지 않는다.
  const prevCorrectUserIdsRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    const correctUserIds = room?.currentRound?.correctUserIds ?? [];
    const prevCorrectUserIds = prevCorrectUserIdsRef.current;
    if (
      prevCorrectUserIds &&
      userId &&
      correctUserIds.includes(userId) &&
      !prevCorrectUserIds.has(userId)
    ) {
      playCorrectAnswerSound();
    }
    prevCorrectUserIdsRef.current = new Set(correctUserIds);
  }, [room?.currentRound?.correctUserIds, userId]);

  // 아래 핸들러들은 GamePlayer 내부 effect의 의존성으로 전달된다(onReady는 LOADING
  // 무한정지 방지용 fallback 타이머, onNextRound는 Shift+→ 단축키 리스너). 매 렌더마다
  // 새 함수를 만들면 그 effect들이 room:state 브로드캐스트가 올 때마다 불필요하게
  // 재실행/재설정된다(예: fallback 타이머가 계속 리셋되어 결코 발화하지 않는 문제).
  // socket이 실제로 바뀔 때만 참조가 바뀌도록 useCallback으로 안정화한다.
  // handleLeave는 room/userId를 참조하지만, Hooks 규칙상 아래 얼리 리턴보다 먼저
  // 선언해야 하므로 내부에서 null을 다시 확인한다(실제로는 얼리 리턴 이후에만 렌더되는
  // JSX에서 호출되므로 항상 non-null이다).
  const handleLeave = useCallback(async () => {
    if (!room || !userId || !accessToken) {
      return;
    }
    setLeaveConfirmOpen(false);
    try {
      await leaveRoom(room.roomId, userId, accessToken);
    } finally {
      clearRoomSession();
      navigate('/rooms', { replace: true });
    }
  }, [room, userId, accessToken, navigate]);

  const handleSendChat = useCallback(
    (message: string) => {
      socket?.emit('chat:message', { message });
    },
    [socket],
  );

  const handleStartGame = useCallback(() => {
    socket?.emit('game:start');
  }, [socket]);

  const handleRestartGame = useCallback(() => {
    socket?.emit('game:restart');
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

  const handleOpenEditRoom = useCallback(() => {
    setEditRoomOpen(true);
  }, []);

  const handleRoomUpdated = useCallback((updatedRoom: RoomItemDto) => {
    setRoom(updatedRoom);
  }, []);

  const handleOpenNicknameModal = useCallback(() => {
    setNicknameModalOpen(true);
  }, []);

  // 방 안에서 바꾼 닉네임을 기본 게스트 닉네임으로도 반영해, 다음에 만들거나
  // 입장하는 방에서도 유지되게 한다(room 상태 자체는 소켓 room:state로 갱신됨).
  const handleNicknameChanged = useCallback(
    (newNickname: string) => {
      setNickname(newNickname);
    },
    [setNickname],
  );

  // 문의 대상 곡 정보는 모달을 여는 시점의 라운드 값을 그대로 고정해둔다.
  // room.currentRound를 직접 참조하면 문의 작성 중 다음 라운드로 넘어갔을 때
  // 모달이 사라지거나 문의 대상 곡이 바뀌어버린다.
  const handleOpenInquiry = useCallback(() => {
    const round = room?.currentRound;
    if (!round?.quizSongId) {
      return;
    }
    setInquiryTarget({
      quizSongId: round.quizSongId,
      songNm: round.songNm ?? '',
      atstNm: round.atstNm ?? '',
    });
  }, [room]);

  const handleInquirySubmitted = useCallback((message: string) => {
    setChatEntries((prev) => [
      ...prev,
      { id: nextEntryId(), type: 'system', message },
    ]);
  }, []);

  // 동시 재생 디버깅용: 이 클라이언트가 실제로 playVideo()를 호출한 시점(예약
  // 시각과의 오차 포함)을 채팅으로 발송한다. DEBUG_USER가 아니면 아무것도 하지 않는다.
  const handlePlaybackTriggered = useCallback(
    (details: PlaybackTriggeredDetails) => {
      if (!isDebugUser(nickname)) {
        return;
      }
      socket?.emit('chat:message', {
        message: `[DEBUG] playback roundIndex=${details.roundIndex} scheduledAt=${details.scheduledAt} actualAt=${details.actualAt} deltaMs=${details.deltaMs}`,
      });
    },
    [socket, nickname],
  );

  // 동시 재생 디버깅용: 유튜브 플레이어가 실제로 PLAYING 상태가 된 시점(버퍼링 등
  // 재생 파이프라인 지연 포함)을 채팅으로 발송한다. DEBUG_USER가 아니면 아무것도 하지 않는다.
  const handlePlaybackStarted = useCallback(
    (details: PlaybackStartedDetails) => {
      if (!isDebugUser(nickname)) {
        return;
      }
      socket?.emit('chat:message', {
        message: `[DEBUG] playback-started roundIndex=${details.roundIndex} scheduledAt=${details.scheduledAt} actualAt=${details.actualAt} deltaMs=${details.deltaMs} commandToStartMs=${details.commandToStartMs}`,
      });
    },
    [socket, nickname],
  );

  if (passwordRequired && (!room || !userId)) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-xs rounded-2xl bg-white p-6 shadow-xl">
          <h2 className="mb-1 text-base font-bold text-slate-800">
            🔒 비밀번호가 필요해요
          </h2>
          <p className="mb-4 text-sm text-slate-500">
            비밀방입니다. 입장 비밀번호를 입력해주세요.
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
                onClick={() => navigate('/rooms', { replace: true })}
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
    );
  }

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
            <Logo size="md" onClick={() => setLeaveConfirmOpen(true)} />
            <span className="rounded-full bg-white px-4 py-1.5 text-sm font-medium text-slate-600 shadow-sm">
              {room.roomTtl}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setLeaveConfirmOpen(true)}
            className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-slate-500 shadow-sm hover:bg-slate-50"
          >
            나가기
          </button>
        </header>

        <div className="flex items-center justify-between rounded-2xl bg-white px-5 py-3 text-sm text-slate-500 shadow-sm">
          <span>{room.quizTtl}</span>
          <span>총 출제곡 {room.songLimit}곡</span>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr]">
          <aside className="max-h-[40vh] overflow-y-auto pr-1 sm:max-h-[55vh] lg:max-h-[calc(100vh-11rem)]">
            <ParticipantList
              participants={room.participants}
              hostUserId={room.hostUserId}
              currentUserId={userId}
              maxUserCnt={room.maxUserCnt}
              correctUserIds={room.currentRound?.correctUserIds ?? []}
              canEditNickname={!isAuthenticated}
              onEditNickname={handleOpenNicknameModal}
            />
          </aside>

          <main className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm">
            <GamePlayer
              room={room}
              myUserId={userId}
              serverTimeOffsetMs={serverTimeOffsetMs}
              onStartGame={handleStartGame}
              onRestartGame={handleRestartGame}
              onReady={handleGameReady}
              onNextRound={handleNextRound}
              onSkip={handleSkip}
              onForceSkip={handleForceSkip}
              onOpenInquiry={handleOpenInquiry}
              onEditRoom={handleOpenEditRoom}
              onPlaybackTriggered={handlePlaybackTriggered}
              onPlaybackStarted={handlePlaybackStarted}
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

      {editRoomOpen && (
        <EditRoomModal
          room={room}
          userId={userId}
          accessToken={accessToken ?? ''}
          onClose={() => setEditRoomOpen(false)}
          onUpdated={handleRoomUpdated}
        />
      )}

      {nicknameModalOpen && (
        <ChangeNicknameModal
          roomId={room.roomId}
          userId={userId}
          accessToken={accessToken ?? ''}
          currentNickname={
            room.participants.find((p) => p.userId === userId)?.nickname ??
            nickname
          }
          onClose={() => setNicknameModalOpen(false)}
          onChanged={handleNicknameChanged}
        />
      )}

      {inquiryTarget && (
        <InquiryModal
          quizSongId={inquiryTarget.quizSongId}
          songNm={inquiryTarget.songNm}
          atstNm={inquiryTarget.atstNm}
          roomId={room.roomId}
          userId={userId}
          onClose={() => setInquiryTarget(null)}
          onSubmitted={handleInquirySubmitted}
        />
      )}

      {leaveConfirmOpen && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-xs rounded-2xl bg-white p-6 text-center shadow-xl">
            <p className="mb-5 text-sm font-medium text-slate-700">
              정말 방을 나가시겠어요?
            </p>
            <div className="flex justify-center gap-2">
              <button
                type="button"
                onClick={() => setLeaveConfirmOpen(false)}
                className="rounded-full border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleLeave}
                className="rounded-full bg-rose-500 px-5 py-2 text-sm font-semibold text-white hover:bg-rose-600"
              >
                나가기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
