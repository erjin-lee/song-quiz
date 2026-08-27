import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateRoomPage } from './CreateRoomPage';
import { useSession } from '../context/SessionContext';
import { getAdConfig } from '../api/config';
import { getQuizSongCount, getQuizzes } from '../api/quiz';
import { createRoom } from '../api/room';
import { ApiError } from '../api/client';
import { loadRoomSession } from '../utils/roomSession';
import type { QuizListItemDto } from '../types/quiz';
import type { RoomJoinResultDto } from '../types/room';

vi.mock('../context/SessionContext', () => ({
  useSession: vi.fn(),
}));

vi.mock('../api/config', () => ({
  getAdConfig: vi.fn(),
}));

vi.mock('../api/quiz', () => ({
  getQuizzes: vi.fn(),
  getQuizSongCount: vi.fn(),
}));

vi.mock('../api/room', () => ({
  createRoom: vi.fn(),
}));

const mockedUseSession = vi.mocked(useSession);
const mockedGetAdConfig = vi.mocked(getAdConfig);
const mockedGetQuizzes = vi.mocked(getQuizzes);
const mockedGetQuizSongCount = vi.mocked(getQuizSongCount);
const mockedCreateRoom = vi.mocked(createRoom);

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

function makeQuiz(overrides: Partial<QuizListItemDto> = {}): QuizListItemDto {
  return {
    quizId: 'quiz-1',
    quizTtl: '2000년대 발라드',
    quizDesc: null,
    thumbImgUrl: null,
    playCnt: 10,
    ...overrides,
  };
}

function renderCreateRoomPage() {
  return render(
    <MemoryRouter initialEntries={['/rooms/new']}>
      <Routes>
        <Route path="/rooms/new" element={<CreateRoomPage />} />
        <Route path="/rooms" element={<div>방 목록 화면</div>} />
        <Route path="/rooms/:roomId" element={<div>게임 화면</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('CreateRoomPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseSession.mockReturnValue(makeSessionValue({}));
    mockedGetAdConfig.mockResolvedValue({ adEnabled: false });
    mockedGetQuizzes.mockResolvedValue([makeQuiz()]);
    mockedGetQuizSongCount.mockResolvedValue(20);
    localStorage.clear();
  });

  it('퀴즈 목록을 불러와 첫 번째 퀴즈를 자동 선택하고 곡 수를 보여준다', async () => {
    renderCreateRoomPage();

    expect(
      await screen.findByText('2000년대 발라드 · 총 20곡'),
    ).toBeInTheDocument();
  });

  it('퀴즈 검색으로 목록을 필터링한다', async () => {
    mockedGetQuizzes.mockResolvedValue([
      makeQuiz({ quizId: 'a', quizTtl: '발라드 모음' }),
      makeQuiz({ quizId: 'b', quizTtl: '댄스 모음' }),
    ]);
    const user = userEvent.setup();

    renderCreateRoomPage();
    await screen.findByText('발라드 모음');

    await user.type(screen.getByPlaceholderText('퀴즈 검색'), '댄스');

    expect(screen.queryByText('발라드 모음')).not.toBeInTheDocument();
    expect(screen.getByText('댄스 모음')).toBeInTheDocument();
  });

  it('필수 입력이 없으면 만들기 버튼이 비활성화된다', async () => {
    renderCreateRoomPage();
    await screen.findByText('2000년대 발라드 · 총 20곡');

    expect(screen.getByRole('button', { name: '만들기' })).toBeDisabled();
  });

  it('방 제목을 입력하면 만들기 버튼이 활성화되고, 제출 시 createRoom을 호출한다', async () => {
    const joinResult: RoomJoinResultDto = {
      room: {
        roomId: 'room-1',
        roomTtl: '내 방',
        quizId: 'quiz-1',
        quizTtl: '2000년대 발라드',
        quizDesc: null,
        songCount: 20,
        songLimit: 20,
        quizThumbImgUrl: null,
        atstIds: [],
        atstNms: [],
        isRandom: true,
        isUnlisted: false,
        isPrivate: false,
        speedModeEnabled: false,
        maxUserCnt: 4,
        curUserCnt: 1,
        hostUserId: 'user-99',
        participants: [],
        crtDt: new Date().toISOString(),
        gameStatus: 'WAITING',
        currentRound: null,
      },
      userId: 'user-99',
      accessToken: 'token-99',
    };
    mockedCreateRoom.mockResolvedValue(joinResult);
    const user = userEvent.setup();

    renderCreateRoomPage();
    await screen.findByText('2000년대 발라드 · 총 20곡');

    await user.type(
      screen.getByPlaceholderText('예) 아이유 노래 맞추기 방'),
      '내 방',
    );
    const submitButton = screen.getByRole('button', { name: '만들기' });
    expect(submitButton).toBeEnabled();
    await user.click(submitButton);

    expect(mockedCreateRoom).toHaveBeenCalledWith({
      roomTtl: '내 방',
      quizId: 'quiz-1',
      isRandom: true,
      speedModeEnabled: false,
      maxUserCnt: 4,
      nickname: '닉네임',
      songLimit: 20,
      isUnlisted: false,
      isPrivate: false,
      password: undefined,
    });
    expect(await screen.findByText('게임 화면')).toBeInTheDocument();
    expect(loadRoomSession()).toEqual({
      roomId: 'room-1',
      userId: 'user-99',
      accessToken: 'token-99',
    });
  });

  it('방 생성이 ApiError로 실패하면 에러 메시지를 보여준다', async () => {
    mockedCreateRoom.mockRejectedValue(
      new ApiError('이미 사용 중인 방 제목입니다.', 409),
    );
    const user = userEvent.setup();

    renderCreateRoomPage();
    await screen.findByText('2000년대 발라드 · 총 20곡');
    await user.type(
      screen.getByPlaceholderText('예) 아이유 노래 맞추기 방'),
      '내 방',
    );
    await user.click(screen.getByRole('button', { name: '만들기' }));

    expect(
      await screen.findByText('이미 사용 중인 방 제목입니다.'),
    ).toBeInTheDocument();
  });

  it('비밀번호 설정을 체크하면 최소 길이 이상 입력해야 만들기 버튼이 활성화된다', async () => {
    const user = userEvent.setup();

    renderCreateRoomPage();
    await screen.findByText('2000년대 발라드 · 총 20곡');
    await user.type(
      screen.getByPlaceholderText('예) 아이유 노래 맞추기 방'),
      '내 방',
    );
    await user.click(screen.getByRole('checkbox', { name: /비밀번호 설정/ }));

    const submitButton = screen.getByRole('button', { name: '만들기' });
    expect(submitButton).toBeDisabled();

    await user.type(
      screen.getByPlaceholderText('4자 이상 입력'),
      '123',
    );
    expect(submitButton).toBeDisabled();

    await user.type(screen.getByPlaceholderText('4자 이상 입력'), '4');
    expect(submitButton).toBeEnabled();
  });

  it('광고가 활성화되어 있으면 방 생성 전 안내 오버레이를 보여준다', async () => {
    mockedGetAdConfig.mockResolvedValue({ adEnabled: true });
    mockedCreateRoom.mockResolvedValue({
      room: {
        roomId: 'room-1',
        roomTtl: '내 방',
        quizId: 'quiz-1',
        quizTtl: '2000년대 발라드',
        quizDesc: null,
        songCount: 20,
        songLimit: 20,
        quizThumbImgUrl: null,
        atstIds: [],
        atstNms: [],
        isRandom: true,
        isUnlisted: false,
        isPrivate: false,
        speedModeEnabled: false,
        maxUserCnt: 4,
        curUserCnt: 1,
        hostUserId: 'user-99',
        participants: [],
        crtDt: new Date().toISOString(),
        gameStatus: 'WAITING',
        currentRound: null,
      },
      userId: 'user-99',
      accessToken: 'token-99',
    });

    renderCreateRoomPage();
    await screen.findByText('2000년대 발라드 · 총 20곡');
    fireEvent.change(
      screen.getByPlaceholderText('예) 아이유 노래 맞추기 방'),
      { target: { value: '내 방' } },
    );
    const submitButton = screen.getByRole('button', { name: '만들기' });

    vi.useFakeTimers();
    fireEvent.click(submitButton);

    expect(screen.getByText('방을 생성하는 중입니다...')).toBeInTheDocument();
    expect(mockedCreateRoom).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(3000);

    expect(mockedCreateRoom).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
