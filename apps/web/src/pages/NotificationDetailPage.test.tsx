import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationDetailPage } from './NotificationDetailPage';
import { ApiError } from '../api/client';
import { getNotification } from '../api/notification';
import type { NotificationItemDto } from '../types/notification';

vi.mock('../api/notification', () => ({
  getNotification: vi.fn(),
}));

const mockedGetNotification = vi.mocked(getNotification);

function makeNotification(
  overrides: Partial<NotificationItemDto> = {},
): NotificationItemDto {
  return {
    notiId: '1',
    notiType: 'QUIZ_REG_COMPLETED',
    title: '퀴즈 등록이 완료됐어요',
    message: "'아이유 노래 맞추기' 퀴즈가 정상적으로 등록됐어요.",
    linkPath: null,
    isRead: true,
    crtDt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/notifications/1']}>
      <Routes>
        <Route
          path="/notifications/:notiId"
          element={<NotificationDetailPage />}
        />
        <Route path="/quizzes/1/edit" element={<div>퀴즈 수정 화면</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('NotificationDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('알림 제목과 내용을 보여준다', async () => {
    mockedGetNotification.mockResolvedValue(makeNotification());

    renderPage();

    expect(await screen.findByText('퀴즈 등록이 완료됐어요')).toBeInTheDocument();
    expect(
      screen.getByText("'아이유 노래 맞추기' 퀴즈가 정상적으로 등록됐어요."),
    ).toBeInTheDocument();
    expect(mockedGetNotification).toHaveBeenCalledWith('1');
  });

  it('linkPath가 있으면 바로가기 버튼을 누르면 해당 경로로 이동한다', async () => {
    mockedGetNotification.mockResolvedValue(
      makeNotification({ linkPath: '/quizzes/1/edit' }),
    );
    const user = userEvent.setup();

    renderPage();
    await user.click(await screen.findByRole('button', { name: '바로가기' }));

    expect(await screen.findByText('퀴즈 수정 화면')).toBeInTheDocument();
  });

  it('linkPath가 없으면 바로가기 버튼을 보여주지 않는다', async () => {
    mockedGetNotification.mockResolvedValue(makeNotification({ linkPath: null }));

    renderPage();
    await screen.findByText('퀴즈 등록이 완료됐어요');

    expect(
      screen.queryByRole('button', { name: '바로가기' }),
    ).not.toBeInTheDocument();
  });

  it('조회에 실패하면 에러 메시지를 보여준다', async () => {
    mockedGetNotification.mockRejectedValue(new ApiError('알림을 찾을 수 없습니다.', 404));

    renderPage();

    expect(
      await screen.findByText('알림을 찾을 수 없습니다.'),
    ).toBeInTheDocument();
  });
});
