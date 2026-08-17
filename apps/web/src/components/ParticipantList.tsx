import { sortParticipantsByScore } from '../utils/participants';
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
  /** true면 '내 정보' 카드에 닉네임 변경 버튼을 노출한다(게스트 전용). */
  canEditNickname?: boolean;
  onEditNickname?: () => void;
}

export function ParticipantList({
  participants,
  hostUserId,
  currentUserId,
  maxUserCnt,
  correctUserIds = [],
  canEditNickname = false,
  onEditNickname,
}: ParticipantListProps) {
  const emptySlotCount = Math.max(maxUserCnt - participants.length, 0);
  const me = participants.find(
    (participant) => participant.userId === currentUserId,
  );
  const ranked = sortParticipantsByScore(participants);

  const renderParticipant = (
    participant: RoomParticipantDto,
    pinned = false,
  ) => {
    const isMe = participant.userId === currentUserId;
    const isCorrect = correctUserIds.includes(participant.userId);
    return (
      <div
        key={participant.userId}
        className={`relative flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-sm transition-colors duration-300 ${
          isCorrect
            ? 'animate-[correct-answer-blink_2s_ease-in-out_1_forwards] border-emerald-400 bg-emerald-50'
            : pinned
              ? 'border-purple-300 bg-gradient-to-r from-purple-50 to-white ring-2 ring-purple-100'
              : isMe
                ? 'border-amber-200 bg-amber-50/60'
                : 'border-transparent bg-white'
        }`}
      >
        {/*{pinned && (
          <span className="absolute -left-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-purple-500 text-xs shadow-sm">
            📌
          </span>
        )}*/}
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
  };

  return (
    <div className="flex flex-col gap-4">
      {me && (
        <div className="flex flex-col gap-1.5 border-b border-dashed border-slate-200 pb-4">
          <div className="flex items-center justify-between px-1">
            <p className="text-xs font-semibold tracking-wide text-purple-400">
              내 정보
            </p>
            {canEditNickname && onEditNickname && (
              <button
                type="button"
                onClick={onEditNickname}
                title="닉네임 변경"
                className="text-xs text-purple-400 transition hover:text-purple-600"
              >
                ✏️ 닉네임 변경
              </button>
            )}
          </div>
          {renderParticipant(me, true)}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <p className="px-1 text-xs font-semibold tracking-wide text-slate-400">
          순위
        </p>
        <div className="flex flex-col gap-3">
          {ranked.map((participant) => renderParticipant(participant))}

          {Array.from({ length: emptySlotCount }).map((_, index) => (
            <div
              key={`empty-${index}`}
              className="flex items-center justify-center rounded-2xl border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-400"
            >
              빈 자리
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
