import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { SignupPage } from './SignupPage';
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

function renderSignupPage() {
  return render(
    <MemoryRouter initialEntries={['/signup']}>
      <Routes>
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/rooms" element={<div>방 목록 화면</div>} />
        <Route path="/" element={<div>로그인 화면</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByPlaceholderText('아이디 (4자 이상)'), 'tester');
  await user.type(
    screen.getByPlaceholderText('비밀번호 (8자 이상)'),
    'password123',
  );
  await user.type(screen.getByPlaceholderText('닉네임'), '닉네임');
}

describe('SignupPage', () => {
  it('세션이 아직 초기화되지 않았으면 폼을 보여주지 않는다', () => {
    mockedUseSession.mockReturnValue(
      makeSessionValue({ isInitialized: false }),
    );

    renderSignupPage();

    expect(
      screen.queryByPlaceholderText('아이디 (4자 이상)'),
    ).not.toBeInTheDocument();
  });

  it('이미 로그인된 상태면 방 목록으로 리다이렉트한다', () => {
    mockedUseSession.mockReturnValue(
      makeSessionValue({ isAuthenticated: true }),
    );

    renderSignupPage();

    expect(screen.getByText('방 목록 화면')).toBeInTheDocument();
  });

  it('아이디/비밀번호/닉네임 조건을 만족하기 전까지 가입하기 버튼이 비활성화된다', async () => {
    mockedUseSession.mockReturnValue(makeSessionValue({}));
    const user = userEvent.setup();

    renderSignupPage();
    const submitButton = screen.getByRole('button', { name: '가입하기' });
    expect(submitButton).toBeDisabled();

    await user.type(screen.getByPlaceholderText('아이디 (4자 이상)'), 'abc');
    await user.type(
      screen.getByPlaceholderText('비밀번호 (8자 이상)'),
      '1234567',
    );
    await user.type(screen.getByPlaceholderText('닉네임'), '닉');
    expect(submitButton).toBeDisabled();

    await user.type(screen.getByPlaceholderText('아이디 (4자 이상)'), 'd');
    await user.type(screen.getByPlaceholderText('비밀번호 (8자 이상)'), '8');
    expect(submitButton).toBeEnabled();
  });

  it('가입에 성공하면 signup을 호출하고 방 목록으로 이동한다', async () => {
    const signup = vi.fn().mockResolvedValue(undefined);
    mockedUseSession.mockReturnValue(makeSessionValue({ signup }));
    const user = userEvent.setup();

    renderSignupPage();
    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: '가입하기' }));

    expect(signup).toHaveBeenCalledWith('tester', 'password123', '닉네임');
    expect(await screen.findByText('방 목록 화면')).toBeInTheDocument();
  });

  it('가입이 ApiError로 실패하면 서버 메시지를 보여준다', async () => {
    const signup = vi
      .fn()
      .mockRejectedValue(new ApiError('이미 사용 중인 아이디입니다.', 409));
    mockedUseSession.mockReturnValue(makeSessionValue({ signup }));
    const user = userEvent.setup();

    renderSignupPage();
    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: '가입하기' }));

    expect(
      await screen.findByText('이미 사용 중인 아이디입니다.'),
    ).toBeInTheDocument();
  });

  it('가입 페이지에는 개인정보처리방침 링크가 있다', () => {
    mockedUseSession.mockReturnValue(makeSessionValue({}));

    renderSignupPage();

    expect(
      screen.getByRole('link', { name: '개인정보처리방침' }),
    ).toHaveAttribute('href', '/privacy');
  });
});
