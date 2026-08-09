import { useEffect, useRef } from 'react';
import YouTube from 'react-youtube';
import type { RoomItemDto } from '../types/room';

interface GamePlayerProps {
  room: RoomItemDto;
  myUserId: string;
  onReady: () => void;
  onStartGame: () => void;
  onPlay: () => void;
  onNextRound: () => void;
}

export function GamePlayer({
  room,
  myUserId,
  onReady,
  onStartGame,
  onPlay,
  onNextRound,
}: GamePlayerProps) {
  const isHost = room.hostUserId === myUserId;
  const round = room.currentRound;
  const playerRef = useRef<YouTube>(null);
  const playedRoundRef = useRef<number | null>(null);

  useEffect(() => {
    if (
      room.gameStatus === 'PLAYING' &&
      round &&
      playedRoundRef.current !== round.roundIndex
    ) {
      playedRoundRef.current = round.roundIndex;
      playerRef.current?.getInternalPlayer()?.playVideo();
    }
  }, [room.gameStatus, round]);

  if (room.gameStatus === 'WAITING') {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-2xl bg-gradient-to-br from-purple-100 to-purple-50 px-6 py-16">
        <p className="text-sm text-slate-500">
          {isHost
            ? '게임을 시작할 준비가 되면 아래 버튼을 눌러주세요.'
            : '방장이 게임을 시작하길 기다리는 중...'}
        </p>
        {isHost && (
          <button
            type="button"
            onClick={onStartGame}
            className="rounded-full bg-purple-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-purple-600"
          >
            게임 시작
          </button>
        )}
      </div>
    );
  }

  if (room.gameStatus === 'FINISHED') {
    const ranked = [...room.participants].sort((a, b) => b.score - a.score);
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl bg-gradient-to-br from-purple-100 to-purple-50 px-6 py-10">
        <p className="text-lg font-bold text-purple-600">게임 종료!</p>
        <ol className="flex w-full max-w-xs flex-col gap-2">
          {ranked.map((participant, index) => (
            <li
              key={participant.userId}
              className="flex items-center justify-between rounded-xl bg-white px-4 py-2 text-sm shadow-sm"
            >
              <span className="font-semibold text-slate-700">
                {index + 1}위 {participant.nickname}
              </span>
              <span className="font-bold text-purple-500">
                {participant.score}P
              </span>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  if (!round) {
    return null;
  }

  const isRevealedForMe =
    round.revealed || round.correctUserIds.includes(myUserId);

  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl bg-gradient-to-br from-purple-100 to-purple-50 px-6 py-10">
      <p className="text-xs font-semibold text-purple-500">
        Round {round.roundIndex + 1} / {round.totalRounds}
      </p>

      <div
        className={
          isRevealedForMe
            ? 'overflow-hidden rounded-xl'
            : 'invisible absolute -left-[9999px] -top-[9999px]'
        }
      >
        {round.youtubeVideoId && (
          <YouTube
            key={`${room.roomId}-${round.roundIndex}`}
            ref={playerRef}
            videoId={round.youtubeVideoId}
            opts={{
              width: '320',
              height: '180',
              playerVars: {
                autoplay: 0,
                start: round.startSec ?? undefined,
                end: round.endSec ?? undefined,
              },
            }}
            onReady={onReady}
          />
        )}
      </div>

      {!isRevealedForMe && (
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-pink-400 text-2xl text-white shadow-lg">
          🎵
        </div>
      )}

      {room.gameStatus === 'LOADING' && (
        <p className="text-sm text-slate-500">
          영상 로딩 중... ({round.readyUserIds.length}/{room.participants.length})
        </p>
      )}

      {room.gameStatus === 'READY_TO_PLAY' &&
        (isHost ? (
          <button
            type="button"
            onClick={onPlay}
            className="rounded-full bg-purple-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-purple-600"
          >
            재생
          </button>
        ) : (
          <p className="text-sm text-slate-500">
            모든 준비가 끝났어요. 방장이 곧 재생을 시작해요.
          </p>
        ))}

      {room.gameStatus === 'PLAYING' && (
        <p className="text-sm text-slate-500">정답을 채팅창에 입력하세요</p>
      )}

      {room.gameStatus === 'ROUND_ENDED' && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm font-semibold text-slate-700">
            정답은 &quot;{round.songNm}&quot;({round.atstNm})였습니다!
          </p>
          {isHost && (
            <button
              type="button"
              onClick={onNextRound}
              className="rounded-full bg-purple-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-purple-600"
            >
              다음 라운드
            </button>
          )}
        </div>
      )}
    </div>
  );
}
