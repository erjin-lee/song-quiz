import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationBell } from './NotificationBell';
import { getNotifications, markAllNotificationsRead } from '../api/notification';
import type { NotificationListDto } from '../types/notification';

vi.mock('../api/notification', () => ({
  getNotifications: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}));

const mockedGetNotifications = vi.mocked(getNotifications);
const mockedMarkAllNotificationsRead = vi.mocked(markAllNotificationsRead);

function makeList(overrides: Partial<NotificationListDto> = {}): NotificationListDto {
  return {
    items: [
      {
        notiId: '1',
        notiType: 'QUIZ_REG_COMPLETED',
        title: '퀴즈 등록이 완료됐어요',
        message: "'아이유 노래 맞추기' 퀴즈가 정상적으로 등록됐어요.",
        linkPath: '/quizzes/1/edit',
        isRead: false,
        crtDt: '2026-01-01T00:00:00.000Z',
      },
    ],
    unreadCount: 1,
    ...overrides,
  };
}

function renderBell() {
  return render(
    <MemoryRouter initialEntries={['/rooms']}>
      <Routes>
        <Route path="/rooms" element={<NotificationBell />} />
        <Route path="/notifications/:notiId" element={<div>알림 상세 화면</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('NotificationBell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedMarkAllNotificationsRead.mockResolvedValue(undefined);
  });

  it('안 읽은 알림이 있으면 배지 숫자를 보여준다', async () => {
    mockedGetNotifications.mockResolvedValue(makeList({ unreadCount: 3 }));

    renderBell();

    expect(await screen.findByText('3')).toBeInTheDocument();
  });

  it('안 읽은 알림이 없으면 배지를 보여주지 않는다', async () => {
    mockedGetNotifications.mockResolvedValue(makeList({ unreadCount: 0 }));

    renderBell();

    await waitFor(() => expect(mockedGetNotifications).toHaveBeenCalled());
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('벨을 클릭하면 목록이 열리고 안 읽음 처리를 요청한다', async () => {
    mockedGetNotifications.mockResolvedValue(makeList());
    const user = userEvent.setup();

    renderBell();
    await screen.findByText('1');

    await user.click(screen.getByRole('button', { name: '알림' }));

    expect(await screen.findByText('퀴즈 등록이 완료됐어요')).toBeInTheDocument();
    expect(mockedMarkAllNotificationsRead).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('1')).not.toBeInTheDocument();
  });

  it('알림이 없으면 안내 문구를 보여준다', async () => {
    mockedGetNotifications.mockResolvedValue(makeList({ items: [], unreadCount: 0 }));
    const user = userEvent.setup();

    renderBell();
    await waitFor(() => expect(mockedGetNotifications).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: '알림' }));

    expect(await screen.findByText('아직 알림이 없어요.')).toBeInTheDocument();
  });

  it('알림 항목을 클릭하면 상세 화면으로 이동한다', async () => {
    mockedGetNotifications.mockResolvedValue(makeList());
    const user = userEvent.setup();

    renderBell();
    await user.click(screen.getByRole('button', { name: '알림' }));
    await user.click(await screen.findByText('퀴즈 등록이 완료됐어요'));

    expect(await screen.findByText('알림 상세 화면')).toBeInTheDocument();
  });
});
