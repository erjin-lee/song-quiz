import type { RoomParticipantDto } from '../types/room';

const AVATAR_COLORS = [
  'bg-purple-500',
  'bg-pink-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-sky-500',
  'bg-rose-500',
];

/**
 * 정렬 순서가 바뀌어도(예: 점수순 정렬) 같은 참가자는 항상 같은 색을 유지하도록
 * 배열 인덱스 대신 userId를 해시해 색을 고른다.
 */
function avatarColorForUser(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

interface ParticipantListProps {
  participants: RoomParticipantDto[];
  hostUserId: string;
  currentUserId: string;
  maxUserCnt: number;
  correctUserIds?: string[];
}

export function ParticipantList({
  participants,
  hostUserId,
  currentUserId,
  maxUserCnt,
  correctUserIds = [],
}: ParticipantListProps) {
  const emptySlotCount = Math.max(maxUserCnt - participants.length, 0);

  return (
    <div className="flex flex-col gap-3">
      {participants.map((participant) => {
        const isMe = participant.userId === currentUserId;
        const isCorrect = correctUserIds.includes(participant.userId);
        return (
          <div
            key={participant.userId}
            className={`flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-sm transition-colors duration-300 ${
              isCorrect
                ? 'animate-[correct-answer-blink_2s_ease-in-out_1_forwards] border-emerald-400 bg-emerald-50'
                : isMe
                  ? 'border-amber-300 bg-amber-50'
                  : 'border-transparent bg-white'
            }`}
          >
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${
                avatarColorForUser(participant.userId)
              }`}
            >
              {participant.nickname.slice(0, 1)}
            </span>
            <div className="min-w-0">
              <p className="truncate font-semibold text-slate-800">
                {participant.nickname}
                {participant.userId === hostUserId && (
                  <span className="ml-1 text-xs font-normal text-amber-500">
                    👑
                  </span>
                )}
              </p>
              <p className="text-xs text-slate-400">{participant.score} P</p>
            </div>
          </div>
        );
      })}

      {Array.from({ length: emptySlotCount }).map((_, index) => (
        <div
          key={`empty-${index}`}
          className="flex items-center justify-center rounded-2xl border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-400"
        >
          빈 자리
        </div>
      ))}
    </div>
  );
}
