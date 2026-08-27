import { forwardRef, useImperativeHandle, useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomGamePage } from './RoomGamePage';
import { useSession } from '../context/SessionContext';
import { getRoomById, joinRoom, leaveRoom } from '../api/room';
import { createRoomSocket } from '../api/socket';
import { ApiError } from '../api/client';
import { saveRoomSession } from '../utils/roomSession';
import type { RoomItemDto } from '../types/room';
import type { ChatEntry } from '../components/ChatPanel';

vi.mock('../context/SessionContext', () => ({
  useSession: vi.fn(),
}));

vi.mock('../api/room', () => ({
  getRoomById: vi.fn(),
  joinRoom: vi.fn(),
  leaveRoom: vi.fn(),
}));

vi.mock('../api/socket', () => ({
  createRoomSocket: vi.fn(),
}));

interface GamePlayerMockProps {
  room: RoomItemDto;
  onStartGame: () => void;
}

vi.mock('../components/GamePlayer', () => ({
  GamePlayer: ({ room, onStartGame }: GamePlayerMockProps) => (
    <div data-testid="game-player">
      <span data-testid="game-status">{room.gameStatus}</span>
      <button type="button" onClick={onStartGame}>
        mock-게임시작
      </button>
    </div>
  ),
}));

interface ChatPanelMockProps {
  entries: ChatEntry[];
  onSend: (message: string) => void;
}
interface ChatPanelMockHandle {
  focus: () => void;
  clearDraft: () => void;
}

vi.mock('../components/ChatPanel', () => ({
  ChatPanel: forwardRef<ChatPanelMockHandle, ChatPanelMockProps>(
    function MockChatPanel({ entries, onSend }, ref) {
      useImperativeHandle(ref, () => ({ focus: () => {}, clearDraft: () => {} }));
      const [draft, setDraft] = useState('');
      return (
        <div>
          <ul>
            {entries.map((entry) => (
              <li key={entry.id}>
                {entry.type === 'message'
                  ? `${entry.nickname}: ${entry.message}`
                  : entry.message}
              </li>
            ))}
          </ul>
          <input
            aria-label="mock-chat-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button type="button" onClick={() => onSend(draft)}>
            mock-전송
          </button>
        </div>
      );
    },
  ),
}));

vi.mock('../components/EditRoomModal', () => ({ EditRoomModal: () => null }));
vi.mock('../components/ChangeNicknameModal', () => ({
  ChangeNicknameModal: () => null,
}));
vi.mock('../components/InquiryModal', () => ({ InquiryModal: () => null }));

const mockedUseSession = vi.mocked(useSession);
const mockedGetRoomById = vi.mocked(getRoomById);
const mockedJoinRoom = vi.mocked(joinRoom);
const mockedLeaveRoom = vi.mocked(leaveRoom);
const mockedCreateRoomSocket = vi.mocked(createRoomSocket);

type SocketHandler = (...args: never[]) => void;

class FakeRoomSocket {
  handlers = new Map<string, SocketHandler[]>();
  emittedCalls: unknown[][] = [];

  on(event: string, handler: SocketHandler) {
    const arr = this.handlers.get(event) ?? [];
    arr.push(handler);
    this.handlers.set(event, arr);
  }

  off(event: string, handler: SocketHandler) {
    this.handlers.set(
      event,
      (this.handlers.get(event) ?? []).filter((h) => h !== handler),
    );
  }

  onAny() {}

  emit(event: string, ...args: unknown[]) {
    this.emittedCalls.push([event, ...args]);
  }

  connect() {}

  disconnect() {}

  trigger(event: string, ...args: unknown[]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.handlers.get(event) ?? []).forEach((h) => (h as any)(...args));
  }

  asRoomSocket(): ReturnType<typeof createRoomSocket> {
    return this as unknown as ReturnType<typeof createRoomSocket>;
  }
}

function makeSessionValue(
  overrides: Partial<ReturnType<typeof useSession>>,
): ReturnType<typeof useSession> {
  return {
    nickname: '닉네임',
    setNickname: vi.fn(),
    isAuthenticated: false,
    isInitialized: true,
    accountUserId: null,
    login: vi.fn(),
    signup: vi.fn(),
    logout: vi.fn(),
    ...overrides,
  };
}

function makeRoom(overrides: Partial<RoomItemDto> = {}): RoomItemDto {
  return {
    roomId: 'room-1',
    roomTtl: '즐거운 노래 퀴즈방',
    quizId: 'quiz-1',
    quizTtl: '2000년대 발라드',
    quizDesc: null,
    songCount: 20,
    songLimit: 10,
    quizThumbImgUrl: null,
    atstIds: [],
    atstNms: [],
    isRandom: true,
    isUnlisted: false,
    isPrivate: false,
    speedModeEnabled: false,
    maxUserCnt: 8,
    curUserCnt: 1,
    hostUserId: 'user-1',
    participants: [
      { userId: 'user-1', nickname: '닉네임', score: 0, isAccount: false },
    ],
    crtDt: new Date().toISOString(),
    gameStatus: 'WAITING',
    currentRound: null,
    ...overrides,
  };
}

function renderRoomGamePage(initialPath = '/rooms/room-1', state?: unknown) {
  return render(
    <MemoryRouter
      initialEntries={[{ pathname: initialPath, state }]}
    >
      <Routes>
        <Route path="/rooms/:roomId" element={<RoomGamePage />} />
        <Route path="/rooms" element={<div>방 목록 화면</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RoomGamePage', () => {
  let fakeSocket: FakeRoomSocket;

  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    fakeSocket = new FakeRoomSocket();
    mockedCreateRoomSocket.mockReturnValue(fakeSocket.asRoomSocket());
    mockedUseSession.mockReturnValue(makeSessionValue({}));
    // location.state로 방 정보를 이미 받은 경우에도, 컴포넌트는 현재 참가자인지
    // 서버에 재확인하는 getRoomById를 항상 호출한다.
    mockedGetRoomById.mockResolvedValue(makeRoom());
  });

  it('location state로 넘어온 방 정보가 있으면 즉시 게임 화면을 보여준다', async () => {
    const room = makeRoom();
    renderRoomGamePage('/rooms/room-1', {
      room,
      userId: 'user-1',
      accessToken: 'token-1',
    });

    expect(await screen.findByText('즐거운 노래 퀴즈방')).toBeInTheDocument();
    expect(screen.getByTestId('game-status')).toHaveTextContent('WAITING');
  });

  it('저장된 방 세션으로 새로고침 후에도 방 정보를 다시 불러온다', async () => {
    saveRoomSession({
      roomId: 'room-1',
      userId: 'user-1',
      accessToken: 'token-1',
    });
    mockedGetRoomById.mockResolvedValue(makeRoom());

    renderRoomGamePage('/rooms/room-1');

    expect(screen.getByText('방 정보를 불러오는 중...')).toBeInTheDocument();
    expect(await screen.findByText('즐거운 노래 퀴즈방')).toBeInTheDocument();
    expect(mockedGetRoomById).toHaveBeenCalledWith('room-1');
  });

  it('참가 기록 없이 공유 링크로 들어오면 닉네임으로 자동 입장한다', async () => {
    mockedJoinRoom.mockResolvedValue({
      room: makeRoom({ participants: [] }),
      userId: 'user-2',
      accessToken: 'token-2',
    });

    renderRoomGamePage('/rooms/room-1');

    expect(await screen.findByText('즐거운 노래 퀴즈방')).toBeInTheDocument();
    expect(mockedJoinRoom).toHaveBeenCalledWith('room-1', {
      nickname: '닉네임',
    });
  });

  it('비밀방에 참가 기록 없이 들어오면 비밀번호 입력 후 입장한다', async () => {
    mockedJoinRoom
      .mockRejectedValueOnce(new ApiError('비밀번호가 필요합니다.', 401))
      .mockResolvedValueOnce({
        room: makeRoom({ isPrivate: true }),
        userId: 'user-2',
        accessToken: 'token-2',
      });
    const user = userEvent.setup();

    renderRoomGamePage('/rooms/room-1');

    expect(
      await screen.findByText('비밀방입니다. 입장 비밀번호를 입력해주세요.'),
    ).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('비밀번호'), 'secret');
    await user.click(screen.getByRole('button', { name: '입장하기' }));

    expect(mockedJoinRoom).toHaveBeenLastCalledWith('room-1', {
      nickname: '닉네임',
      password: 'secret',
    });
    expect(await screen.findByText('즐거운 노래 퀴즈방')).toBeInTheDocument();
  });

  it('소켓이 연결되면 room:enter 이벤트를 보낸다', async () => {
    const room = makeRoom();
    renderRoomGamePage('/rooms/room-1', {
      room,
      userId: 'user-1',
      accessToken: 'token-1',
    });
    await screen.findByText('즐거운 노래 퀴즈방');

    fakeSocket.trigger('connect');

    expect(fakeSocket.emittedCalls).toContainEqual([
      'room:enter',
      { roomId: 'room-1', userId: 'user-1', accessToken: 'token-1' },
    ]);
  });

  it('chat:message 이벤트를 받으면 채팅 목록에 추가한다', async () => {
    const room = makeRoom();
    renderRoomGamePage('/rooms/room-1', {
      room,
      userId: 'user-1',
      accessToken: 'token-1',
    });
    await screen.findByText('즐거운 노래 퀴즈방');

    fakeSocket.trigger('chat:message', {
      userId: 'user-2',
      nickname: '다른유저',
      message: '안녕하세요',
      sentAt: new Date().toISOString(),
    });

    expect(await screen.findByText('다른유저: 안녕하세요')).toBeInTheDocument();
  });

  it('게임 시작을 누르면 socket으로 game:start를 emit한다', async () => {
    const room = makeRoom();
    renderRoomGamePage('/rooms/room-1', {
      room,
      userId: 'user-1',
      accessToken: 'token-1',
    });
    const user = userEvent.setup();
    await user.click(await screen.findByText('mock-게임시작'));

    expect(fakeSocket.emittedCalls).toContainEqual(['game:start']);
  });

  it('나가기를 확인하면 leaveRoom을 호출하고 방 목록으로 이동한다', async () => {
    mockedLeaveRoom.mockResolvedValue({ roomDeleted: false });
    const room = makeRoom();
    renderRoomGamePage('/rooms/room-1', {
      room,
      userId: 'user-1',
      accessToken: 'token-1',
    });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: '나가기' }));
    const confirmDialog = (
      await screen.findByText('정말 방을 나가시겠어요?')
    ).closest('div')!;
    await user.click(
      within(confirmDialog).getByRole('button', { name: '나가기' }),
    );

    expect(mockedLeaveRoom).toHaveBeenCalledWith(
      'room-1',
      'user-1',
      'token-1',
    );
    expect(await screen.findByText('방 목록 화면')).toBeInTheDocument();
  });
});
