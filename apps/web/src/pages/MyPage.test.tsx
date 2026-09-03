import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MyPage } from './MyPage';
import { useSession } from '../context/SessionContext';
import { ApiError } from '../api/client';
import { getNotifications } from '../api/notification';
import { deleteQuiz, getMyQuizzes } from '../api/quiz-registration';
import type { MyQuizListItemDto } from '../types/quiz-registration';

vi.mock('../context/SessionContext', () => ({
  useSession: vi.fn(),
}));

vi.mock('../api/notification', () => ({
  getNotifications: vi.fn(),
}));

vi.mock('../api/quiz-registration', () => ({
  getMyQuizzes: vi.fn(),
  deleteQuiz: vi.fn(),
}));

const mockedUseSession = vi.mocked(useSession);
const mockedGetMyQuizzes = vi.mocked(getMyQuizzes);
const mockedDeleteQuiz = vi.mocked(deleteQuiz);
const mockedGetNotifications = vi.mocked(getNotifications);

function makeSessionValue(
  overrides: Partial<ReturnType<typeof useSession>>,
): ReturnType<typeof useSession> {
  return {
    nickname: '닉네임',
    setNickname: vi.fn(),
    isAuthenticated: true,
    isInitialized: true,
    accountUserId: 'user-1',
    login: vi.fn(),
    signup: vi.fn(),
    logout: vi.fn(),
    ...overrides,
  };
}

function makeQuiz(
  overrides: Partial<MyQuizListItemDto> = {},
): MyQuizListItemDto {
  return {
    quizId: 'quiz-1',
    quizTtl: '내 퀴즈',
    quizDesc: null,
    songCount: 5,
    playCnt: 3,
    crtDt: new Date().toISOString(),
    ...overrides,
  };
}

function renderMyPage(initialState?: { message?: string }) {
  return render(
    <MemoryRouter
      initialEntries={[{ pathname: '/mypage', state: initialState }]}
    >
      <Routes>
        <Route path="/mypage" element={<MyPage />} />
        <Route path="/rooms" element={<div>방 목록 화면</div>} />
        <Route path="/quizzes/new" element={<div>퀴즈 만들기 화면</div>} />
        <Route
          path="/quizzes/:quizId/edit"
          element={<div>퀴즈 수정 화면</div>}
        />
        <Route
          path="/notifications/:notiId"
          element={<div>알림 상세 화면</div>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('MyPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('비로그인 상태면 방 목록으로 이동한다', async () => {
    mockedUseSession.mockReturnValue(
      makeSessionValue({ isAuthenticated: false }),
    );

    renderMyPage();

    expect(await screen.findByText('방 목록 화면')).toBeInTheDocument();
    expect(mockedGetMyQuizzes).not.toHaveBeenCalled();
  });

  it('내가 등록한 퀴즈 목록을 보여준다', async () => {
    mockedUseSession.mockReturnValue(makeSessionValue({}));
    mockedGetMyQuizzes.mockResolvedValue([
      makeQuiz({ quizTtl: '첫번째 퀴즈' }),
    ]);

    renderMyPage();

    expect(await screen.findByText('첫번째 퀴즈')).toBeInTheDocument();
    expect(screen.getByText('5곡 · 플레이 3회')).toBeInTheDocument();
  });

  it('등록한 퀴즈가 없으면 빈 상태와 퀴즈 만들기 버튼을 보여준다', async () => {
    mockedUseSession.mockReturnValue(makeSessionValue({}));
    mockedGetMyQuizzes.mockResolvedValue([]);
    const user = userEvent.setup();

    renderMyPage();
    await screen.findByText('아직 등록한 퀴즈가 없어요');
    await user.click(screen.getByRole('button', { name: '+ 퀴즈 만들기' }));

    expect(await screen.findByText('퀴즈 만들기 화면')).toBeInTheDocument();
  });

  it('목록 조회에 실패하면 에러 메시지를 보여준다', async () => {
    mockedUseSession.mockReturnValue(makeSessionValue({}));
    mockedGetMyQuizzes.mockRejectedValue(new ApiError('서버 오류입니다.', 500));

    renderMyPage();

    expect(await screen.findByText('서버 오류입니다.')).toBeInTheDocument();
  });

  it('수정 버튼을 누르면 수정 화면으로 이동한다', async () => {
    mockedUseSession.mockReturnValue(makeSessionValue({}));
    mockedGetMyQuizzes.mockResolvedValue([makeQuiz()]);
    const user = userEvent.setup();

    renderMyPage();
    await user.click(await screen.findByRole('button', { name: '수정' }));

    expect(await screen.findByText('퀴즈 수정 화면')).toBeInTheDocument();
  });

  it('삭제 확인 모달에서 삭제하면 목록에서 사라진다', async () => {
    mockedUseSession.mockReturnValue(makeSessionValue({}));
    mockedGetMyQuizzes.mockResolvedValue([makeQuiz({ quizTtl: '지울 퀴즈' })]);
    mockedDeleteQuiz.mockResolvedValue(undefined);
    const user = userEvent.setup();

    renderMyPage();
    await screen.findByText('지울 퀴즈');
    await user.click(screen.getByRole('button', { name: '삭제' }));
    expect(screen.getByText('정말 삭제할까요?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '삭제하기' }));

    expect(mockedDeleteQuiz).toHaveBeenCalledWith('quiz-1');
    expect(await screen.findByText('아직 등록한 퀴즈가 없어요')).toBeInTheDocument();
  });

  it('전달받은 안내 메시지를 보여준다', async () => {
    mockedUseSession.mockReturnValue(makeSessionValue({}));
    mockedGetMyQuizzes.mockResolvedValue([]);

    renderMyPage({ message: '등록 신청이 접수됐어요.' });

    expect(
      await screen.findByText('등록 신청이 접수됐어요.'),
    ).toBeInTheDocument();
  });

  it('알림 탭을 누르면 알림 목록을 보여준다', async () => {
    mockedUseSession.mockReturnValue(makeSessionValue({}));
    mockedGetMyQuizzes.mockResolvedValue([]);
    mockedGetNotifications.mockResolvedValue({
      items: [
        {
          notiId: 'noti-1',
          notiType: 'QUIZ_REG_COMPLETED',
          title: '퀴즈 등록이 완료됐어요',
          message: '내 퀴즈가 정상적으로 등록됐어요.',
          linkPath: null,
          isRead: false,
          crtDt: new Date().toISOString(),
        },
      ],
      unreadCount: 1,
    });
    const user = userEvent.setup();

    renderMyPage();
    await screen.findByText('아직 등록한 퀴즈가 없어요');
    await user.click(screen.getByRole('button', { name: '알림' }));

    expect(
      await screen.findByText('퀴즈 등록이 완료됐어요'),
    ).toBeInTheDocument();
  });
});
