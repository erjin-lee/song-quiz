import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RoomCard } from './RoomCard';
import type { RoomItemDto } from '../types/room';

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
    curUserCnt: 3,
    hostUserId: 'user-1',
    participants: [],
    crtDt: new Date().toISOString(),
    gameStatus: 'WAITING',
    currentRound: null,
    ...overrides,
  };
}

describe('RoomCard', () => {
  it('방 제목, 퀴즈 제목, 곡 수, 인원 현황을 보여준다', () => {
    render(<RoomCard room={makeRoom()} onJoin={vi.fn()} joining={false} />);

    expect(screen.getByText('즐거운 노래 퀴즈방')).toBeInTheDocument();
    expect(screen.getByText('2000년대 발라드 · 총 10곡')).toBeInTheDocument();
    expect(screen.getByText('3/8명')).toBeInTheDocument();
  });

  it('비밀방이면 자물쇠 아이콘을 보여준다', () => {
    render(
      <RoomCard room={makeRoom({ isPrivate: true })} onJoin={vi.fn()} joining={false} />,
    );

    expect(screen.getByTitle('비밀번호가 필요한 방입니다')).toBeInTheDocument();
  });

  it('정원이 가득 차면 입장 버튼이 비활성화되고 "정원 초과"를 보여준다', () => {
    render(
      <RoomCard
        room={makeRoom({ curUserCnt: 8, maxUserCnt: 8 })}
        onJoin={vi.fn()}
        joining={false}
      />,
    );

    const button = screen.getByRole('button', { name: '정원 초과' });
    expect(button).toBeDisabled();
  });

  it('입장 처리 중이면 "입장 중..."을 보여주고 버튼을 비활성화한다', () => {
    render(<RoomCard room={makeRoom()} onJoin={vi.fn()} joining />);

    const button = screen.getByRole('button', { name: '입장 중...' });
    expect(button).toBeDisabled();
  });

  it('disabled prop이 true면 정원이 남아있어도 버튼을 비활성화한다', () => {
    render(<RoomCard room={makeRoom()} onJoin={vi.fn()} joining={false} disabled />);

    expect(screen.getByRole('button', { name: '입장하기' })).toBeDisabled();
  });

  it('입장하기 버튼을 클릭하면 onJoin이 호출된다', async () => {
    const onJoin = vi.fn();
    const user = userEvent.setup();
    render(<RoomCard room={makeRoom()} onJoin={onJoin} joining={false} />);

    await user.click(screen.getByRole('button', { name: '입장하기' }));

    expect(onJoin).toHaveBeenCalledTimes(1);
  });
});
