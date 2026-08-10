import type { RoomItemDto } from '../types/room';

interface RoomCardProps {
  room: RoomItemDto;
  onJoin: () => void;
  joining: boolean;
}

export function RoomCard({ room, onJoin, joining }: RoomCardProps) {
  const isFull = room.curUserCnt >= room.maxUserCnt;

  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-white px-5 py-4 shadow-sm">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate font-bold text-slate-800">
            {room.roomTtl}
          </h3>
          <span className="shrink-0 rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-medium text-purple-600">
            {room.quizTtl}
          </span>
        </div>
        {room.atstNms.length > 0 && (
          <p className="mt-1 truncate text-sm text-slate-400">
            {room.atstNms.join(', ')}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-4">
        <span
          className={`text-sm font-semibold ${isFull ? 'text-rose-400' : 'text-slate-500'}`}
        >
          {room.curUserCnt}/{room.maxUserCnt}명
        </span>
        <button
          type="button"
          onClick={onJoin}
          disabled={isFull || joining}
          className="rounded-full bg-purple-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-purple-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
        >
          {isFull ? '정원 초과' : joining ? '입장 중...' : '입장하기'}
        </button>
      </div>
    </div>
  );
}
