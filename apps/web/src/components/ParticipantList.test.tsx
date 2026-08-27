import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ParticipantList } from './ParticipantList';
import type { RoomParticipantDto } from '../types/room';

function participant(overrides: Partial<RoomParticipantDto>): RoomParticipantDto {
  return {
    userId: 'user-1',
    nickname: '닉네임',
    score: 0,
    isAccount: false,
    ...overrides,
  };
}

describe('ParticipantList', () => {
  it('현재 유저가 참가자 목록에 있으면 "내 정보" 섹션을 보여준다', () => {
    const me = participant({ userId: 'me', nickname: '나' });
    render(
      <ParticipantList
        participants={[me]}
        hostUserId="host"
        currentUserId="me"
        maxUserCnt={4}
      />,
    );

    expect(screen.getByText('내 정보')).toBeInTheDocument();
  });

  it('현재 유저가 참가자 목록에 없으면 "내 정보" 섹션을 보여주지 않는다', () => {
    render(
      <ParticipantList
        participants={[participant({ userId: 'other' })]}
        hostUserId="host"
        currentUserId="me"
        maxUserCnt={4}
      />,
    );

    expect(screen.queryByText('내 정보')).not.toBeInTheDocument();
  });

  it('방장에게는 왕관 표시를 붙인다', () => {
    render(
      <ParticipantList
        participants={[participant({ userId: 'host', nickname: '방장' })]}
        hostUserId="host"
        currentUserId="someone-else"
        maxUserCnt={4}
      />,
    );

    expect(screen.getByText('👑')).toBeInTheDocument();
  });

  it('순위 목록은 점수 내림차순으로 정렬된다', () => {
    render(
      <ParticipantList
        participants={[
          participant({ userId: 'a', nickname: 'Alice', score: 10 }),
          participant({ userId: 'b', nickname: 'Bob', score: 30 }),
          participant({ userId: 'c', nickname: 'Carol', score: 20 }),
        ]}
        hostUserId="host"
        currentUserId="none"
        maxUserCnt={3}
      />,
    );

    const rankList = screen.getByText('순위').nextElementSibling as HTMLElement;
    const names = within(rankList).getAllByText(/Alice|Bob|Carol/);
    expect(names.map((el) => el.textContent)).toEqual(['Bob', 'Carol', 'Alice']);
  });

  it('빈 자리는 maxUserCnt에서 참가자 수를 뺀 만큼 표시한다', () => {
    render(
      <ParticipantList
        participants={[participant({ userId: 'a' })]}
        hostUserId="host"
        currentUserId="none"
        maxUserCnt={4}
      />,
    );

    expect(screen.getAllByText('빈 자리')).toHaveLength(3);
  });

  it('canEditNickname이 true이고 onEditNickname이 주어지면 닉네임 변경 버튼을 클릭할 수 있다', async () => {
    const onEditNickname = vi.fn();
    const user = userEvent.setup();
    render(
      <ParticipantList
        participants={[participant({ userId: 'me' })]}
        hostUserId="host"
        currentUserId="me"
        maxUserCnt={4}
        canEditNickname
        onEditNickname={onEditNickname}
      />,
    );

    await user.click(screen.getByRole('button', { name: /닉네임 변경/ }));

    expect(onEditNickname).toHaveBeenCalledTimes(1);
  });

  it('canEditNickname이 false면 닉네임 변경 버튼을 보여주지 않는다', () => {
    render(
      <ParticipantList
        participants={[participant({ userId: 'me' })]}
        hostUserId="host"
        currentUserId="me"
        maxUserCnt={4}
        canEditNickname={false}
        onEditNickname={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole('button', { name: /닉네임 변경/ }),
    ).not.toBeInTheDocument();
  });
});
