import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomListPage } from './RoomListPage';
import { useSession } from '../context/SessionContext';
import { getAdConfig } from '../api/config';
import { getRooms, joinRoom } from '../api/room';
import { ApiError } from '../api/client';
import { loadRoomSession } from '../utils/roomSession';
import type { RoomItemDto, RoomJoinResultDto } from '../types/room';

vi.mock('../context/SessionContext', () => ({
  useSession: vi.fn(),
}));

vi.mock('../api/config', () => ({
  getAdConfig: vi.fn(),
}));

vi.mock('../api/room', () => ({
  getRooms: vi.fn(),
  joinRoom: vi.fn(),
}));

const mockedUseSession = vi.mocked(useSession);
const mockedGetAdConfig = vi.mocked(getAdConfig);
const mockedGetRooms = vi.mocked(getRooms);
const mockedJoinRoom = vi.mocked(joinRoom);

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
    atstNms: ['아이유'],
    isRandom: true,
    isUnlisted: false,
    isPrivate: false,
    speedModeEnabled: false,
    maxUserCnt: 8,
    curUserCnt: 3,
    hostUserId: 'user-1',
    participants: [],
    crtDt: new Date().toISOString(),
    gameStatus: 'WAITING',
    currentRound: null,
    ...overrides,
  };
}

function renderRoomListPage() {
  return render(
    <MemoryRouter initialEntries={['/rooms']}>
      <Routes>
        <Route path="/rooms" element={<RoomListPage />} />
        <Route path="/rooms/new" element={<div>방 만들기 화면</div>} />
        <Route path="/rooms/:roomId" element={<div>게임 화면</div>} />
        <Route path="/" element={<div>로그인 화면</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RoomListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetAdConfig.mockResolvedValue({ adEnabled: false });
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('방 목록을 불러와 보여준다', async () => {
    mockedUseSession.mockReturnValue(makeSessionValue({}));
    mockedGetRooms.mockResolvedValue([makeRoom()]);

    renderRoomListPage();

    expect(await screen.findByText('즐거운 노래 퀴즈방')).toBeInTheDocument();
  });

  it('방 목록 조회에 실패하면 에러 메시지를 보여준다', async () => {
    mockedUseSession.mockReturnValue(makeSessionValue({}));
    mockedGetRooms.mockRejectedValue(new ApiError('서버 오류입니다.', 500));

    renderRoomListPage();

    expect(await screen.findByText('서버 오류입니다.')).toBeInTheDocument();
  });

  it('검색어로 방 제목/퀴즈/가수를 필터링한다', async () => {
    mockedUseSession.mockReturnValue(makeSessionValue({}));
    mockedGetRooms.mockResolvedValue([
      makeRoom({ roomId: 'a', roomTtl: '아이유 방', atstNms: ['아이유'] }),
      makeRoom({ roomId: 'b', roomTtl: '뉴진스 방', atstNms: ['뉴진스'] }),
    ]);
    const user = userEvent.setup();

    renderRoomListPage();
    await screen.findByText('아이유 방');

    await user.type(
      screen.getByPlaceholderText('방 제목, 퀴즈, 가수로 검색'),
      '뉴진스',
    );

    expect(screen.queryByText('아이유 방')).not.toBeInTheDocument();
    expect(screen.getByText('뉴진스 방')).toBeInTheDocument();
  });

  it('방이 하나도 없으면 안내 문구를 보여준다', async () => {
    mockedUseSession.mockReturnValue(makeSessionValue({}));
    mockedGetRooms.mockResolvedValue([]);

    renderRoomListPage();

    expect(await screen.findByText('아직 열린 방이 없어요')).toBeInTheDocument();
  });

  it('닉네임이 있으면 새 방 만들기 클릭 시 /rooms/new로 이동한다', async () => {
    mockedUseSession.mockReturnValue(makeSessionValue({ nickname: '닉네임' }));
    mockedGetRooms.mockResolvedValue([]);
    const user = userEvent.setup();

    renderRoomListPage();
    await screen.findByText('아직 열린 방이 없어요');
    await user.click(screen.getAllByRole('button', { name: '+ 새 방 만들기' })[0]);

    expect(await screen.findByText('방 만들기 화면')).toBeInTheDocument();
  });

  it('닉네임이 없으면 새 방 만들기 클릭 시 로그인 화면으로 이동한다', async () => {
    mockedUseSession.mockReturnValue(makeSessionValue({ nickname: '' }));
    mockedGetRooms.mockResolvedValue([]);
    const user = userEvent.setup();

    renderRoomListPage();
    await screen.findByText('아직 열린 방이 없어요');
    await user.click(screen.getAllByRole('button', { name: '+ 새 방 만들기' })[0]);

    expect(await screen.findByText('로그인 화면')).toBeInTheDocument();
  });

  it('공개방 입장에 성공하면 세션을 저장하고 게임 화면으로 이동한다', async () => {
    mockedUseSession.mockReturnValue(makeSessionValue({ nickname: '닉네임' }));
    mockedGetRooms.mockResolvedValue([makeRoom()]);
    const joinResult: RoomJoinResultDto = {
      room: makeRoom(),
      userId: 'user-99',
      accessToken: 'token-99',
    };
    mockedJoinRoom.mockResolvedValue(joinResult);
    const user = userEvent.setup();

    renderRoomListPage();
    await user.click(await screen.findByRole('button', { name: '입장하기' }));

    expect(mockedJoinRoom).toHaveBeenCalledWith('room-1', {
      nickname: '닉네임',
      password: undefined,
    });
    expect(await screen.findByText('게임 화면')).toBeInTheDocument();
    expect(loadRoomSession()).toEqual({
      roomId: 'room-1',
      userId: 'user-99',
      accessToken: 'token-99',
    });
  });

  it('비밀방은 비밀번호 입력 모달을 띄우고, 제출 시 비밀번호와 함께 입장한다', async () => {
    mockedUseSession.mockReturnValue(makeSessionValue({ nickname: '닉네임' }));
    mockedGetRooms.mockResolvedValue([makeRoom({ isPrivate: true })]);
    mockedJoinRoom.mockResolvedValue({
      room: makeRoom({ isPrivate: true }),
      userId: 'user-99',
      accessToken: 'token-99',
    });
    const user = userEvent.setup();

    renderRoomListPage();
    await user.click(await screen.findByRole('button', { name: '입장하기' }));

    const modal = screen.getByText('🔒 비밀번호가 필요해요').closest('div')!;
    await user.type(within(modal).getByPlaceholderText('비밀번호'), 'secret');
    await user.click(within(modal).getByRole('button', { name: '입장하기' }));

    expect(mockedJoinRoom).toHaveBeenCalledWith('room-1', {
      nickname: '닉네임',
      password: 'secret',
    });
    expect(await screen.findByText('게임 화면')).toBeInTheDocument();
  });

  it('비밀방 입장 실패 시 모달 안에 에러 메시지를 보여준다', async () => {
    mockedUseSession.mockReturnValue(makeSessionValue({ nickname: '닉네임' }));
    mockedGetRooms.mockResolvedValue([makeRoom({ isPrivate: true })]);
    mockedJoinRoom.mockRejectedValue(
      new ApiError('비밀번호가 올바르지 않습니다.', 401),
    );
    const user = userEvent.setup();

    renderRoomListPage();
    await user.click(await screen.findByRole('button', { name: '입장하기' }));
    const modal = screen.getByText('🔒 비밀번호가 필요해요').closest('div')!;
    await user.type(within(modal).getByPlaceholderText('비밀번호'), 'wrong');
    await user.click(within(modal).getByRole('button', { name: '입장하기' }));

    expect(
      await screen.findByText('비밀번호가 올바르지 않습니다.'),
    ).toBeInTheDocument();
  });

  it('광고가 활성화되어 있으면 입장 전 안내 오버레이를 보여준다', async () => {
    mockedGetAdConfig.mockResolvedValue({ adEnabled: true });
    mockedUseSession.mockReturnValue(makeSessionValue({ nickname: '닉네임' }));
    mockedGetRooms.mockResolvedValue([makeRoom()]);
    mockedJoinRoom.mockResolvedValue({
      room: makeRoom(),
      userId: 'user-99',
      accessToken: 'token-99',
    });
    renderRoomListPage();
    const joinButton = await screen.findByRole('button', { name: '입장하기' });

    vi.useFakeTimers();
    fireEvent.click(joinButton);

    expect(screen.getByText('방에 입장하는 중입니다...')).toBeInTheDocument();
    expect(mockedJoinRoom).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(3000);

    expect(mockedJoinRoom).toHaveBeenCalled();
  });

  it('닉네임을 수정할 수 있다', async () => {
    const setNickname = vi.fn();
    mockedUseSession.mockReturnValue(
      makeSessionValue({ nickname: '기존닉네임', setNickname }),
    );
    mockedGetRooms.mockResolvedValue([]);
    const user = userEvent.setup();

    renderRoomListPage();
    await user.click(screen.getByTitle('클릭해서 닉네임 수정'));
    const input = screen.getByDisplayValue('기존닉네임');
    await user.clear(input);
    await user.type(input, '새닉네임');
    await user.click(screen.getByRole('button', { name: '저장' }));

    expect(setNickname).toHaveBeenCalledWith('새닉네임');
  });

  it('로그인 상태면 로그아웃 버튼을 보여주고 클릭 시 로그아웃 후 로그인 화면으로 이동한다', async () => {
    const logout = vi.fn().mockResolvedValue(undefined);
    mockedUseSession.mockReturnValue(
      makeSessionValue({ isAuthenticated: true, logout }),
    );
    mockedGetRooms.mockResolvedValue([]);
    const user = userEvent.setup();

    renderRoomListPage();
    await user.click(await screen.findByRole('button', { name: '로그아웃' }));

    expect(logout).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('로그인 화면')).toBeInTheDocument();
  });
});
