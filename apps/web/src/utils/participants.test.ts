import { describe, expect, it } from 'vitest';
import { sortParticipantsByScore } from './participants';
import type { RoomParticipantDto } from '../types/room';

function participant(
  overrides: Partial<RoomParticipantDto>,
): RoomParticipantDto {
  return {
    userId: 'user-1',
    nickname: '닉네임',
    score: 0,
    isAccount: false,
    ...overrides,
  };
}

describe('sortParticipantsByScore', () => {
  it('점수가 높은 참가자부터 내림차순으로 정렬한다', () => {
    const participants = [
      participant({ userId: 'a', score: 10 }),
      participant({ userId: 'b', score: 30 }),
      participant({ userId: 'c', score: 20 }),
    ];

    const sorted = sortParticipantsByScore(participants);

    expect(sorted.map((p) => p.userId)).toEqual(['b', 'c', 'a']);
  });

  it('원본 배열을 변경하지 않는다', () => {
    const participants = [
      participant({ userId: 'a', score: 10 }),
      participant({ userId: 'b', score: 30 }),
    ];
    const original = [...participants];

    sortParticipantsByScore(participants);

    expect(participants).toEqual(original);
  });

  it('빈 배열을 넘기면 빈 배열을 반환한다', () => {
    expect(sortParticipantsByScore([])).toEqual([]);
  });
});
