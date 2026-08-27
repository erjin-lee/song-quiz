import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { LoginPage } from './LoginPage';
import { useSession } from '../context/SessionContext';
import { ApiError } from '../api/client';

vi.mock('../context/SessionContext', () => ({
  useSession: vi.fn(),
}));

const mockedUseSession = vi.mocked(useSession);

function makeSessionValue(
  overrides: Partial<ReturnType<typeof useSession>>,
): ReturnType<typeof useSession> {
  return {
    nickname: '',
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

function renderLoginPage() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/rooms" element={<div>방 목록 화면</div>} />
        <Route path="/signup" element={<div>회원가입 화면</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('LoginPage', () => {
  it('세션이 아직 초기화되지 않았으면 로그인 폼을 보여주지 않는다', () => {
    mockedUseSession.mockReturnValue(
      makeSessionValue({ isInitialized: false }),
    );

    renderLoginPage();

    expect(screen.queryByPlaceholderText('아이디')).not.toBeInTheDocument();
  });

  it('이미 로그인된 상태면 방 목록으로 리다이렉트한다', () => {
    mockedUseSession.mockReturnValue(
      makeSessionValue({ isAuthenticated: true }),
    );

    renderLoginPage();

    expect(screen.getByText('방 목록 화면')).toBeInTheDocument();
  });

  it('아이디/비밀번호로 로그인에 성공하면 방 목록으로 이동한다', async () => {
    const login = vi.fn().mockResolvedValue(undefined);
    mockedUseSession.mockReturnValue(makeSessionValue({ login }));
    const user = userEvent.setup();

    renderLoginPage();
    await user.type(screen.getByPlaceholderText('아이디'), '  tester  ');
    await user.type(screen.getByPlaceholderText('비밀번호'), 'password123');
    await user.click(screen.getByRole('button', { name: '로그인' }));

    expect(login).toHaveBeenCalledWith('tester', 'password123');
    expect(await screen.findByText('방 목록 화면')).toBeInTheDocument();
  });

  it('로그인이 ApiError로 실패하면 서버 메시지를 보여준다', async () => {
    const login = vi
      .fn()
      .mockRejectedValue(new ApiError('아이디 또는 비밀번호가 올바르지 않습니다.', 401));
    mockedUseSession.mockReturnValue(makeSessionValue({ login }));
    const user = userEvent.setup();

    renderLoginPage();
    await user.type(screen.getByPlaceholderText('아이디'), 'tester');
    await user.type(screen.getByPlaceholderText('비밀번호'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: '로그인' }));

    expect(
      await screen.findByText('아이디 또는 비밀번호가 올바르지 않습니다.'),
    ).toBeInTheDocument();
  });

  it('로그인이 알 수 없는 이유로 실패하면 기본 안내 메시지를 보여준다', async () => {
    const login = vi.fn().mockRejectedValue(new Error('network down'));
    mockedUseSession.mockReturnValue(makeSessionValue({ login }));
    const user = userEvent.setup();

    renderLoginPage();
    await user.type(screen.getByPlaceholderText('아이디'), 'tester');
    await user.type(screen.getByPlaceholderText('비밀번호'), 'password123');
    await user.click(screen.getByRole('button', { name: '로그인' }));

    expect(await screen.findByText('로그인에 실패했습니다.')).toBeInTheDocument();
  });

  it('게스트 모드로 전환해 닉네임만으로 방 목록에 입장할 수 있다', async () => {
    const setNickname = vi.fn();
    mockedUseSession.mockReturnValue(makeSessionValue({ setNickname }));
    const user = userEvent.setup();

    renderLoginPage();
    await user.click(screen.getByRole('button', { name: '게스트 모드' }));
    await user.type(
      screen.getByPlaceholderText('닉네임을 입력하세요'),
      '  게스트닉  ',
    );
    await user.click(screen.getByRole('button', { name: '시작하기' }));

    expect(setNickname).toHaveBeenCalledWith('게스트닉');
    expect(await screen.findByText('방 목록 화면')).toBeInTheDocument();
  });

  it('게스트 닉네임이 비어있으면 시작하기 버튼이 비활성화된다', async () => {
    mockedUseSession.mockReturnValue(makeSessionValue({ nickname: '' }));
    const user = userEvent.setup();

    renderLoginPage();
    await user.click(screen.getByRole('button', { name: '게스트 모드' }));

    expect(screen.getByRole('button', { name: '시작하기' })).toBeDisabled();
  });
});
