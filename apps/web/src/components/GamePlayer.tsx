import { useEffect, useRef, useState } from 'react';
import YouTube from 'react-youtube';
import type { RoomItemDto } from '../types/room';

interface GamePlayerProps {
  room: RoomItemDto;
  myUserId: string;
  onReady: () => void;
  onStartGame: () => void;
  onNextRound: () => void;
  onSkip: () => void;
  onForceSkip: () => void;
  shortcutEnabled: boolean;
  onShortcutEnabledChange: (enabled: boolean) => void;
}

function useCountdownSeconds(targetIso: string | null): number | null {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!targetIso) {
      setRemaining(null);
      return;
    }

    const target = new Date(targetIso).getTime();
    const tick = () => {
      setRemaining(Math.max(0, Math.ceil((target - Date.now()) / 1000)));
    };
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [targetIso]);

  return remaining;
}

export function GamePlayer({
  room,
  myUserId,
  onReady,
  onStartGame,
  onNextRound,
  onSkip,
  onForceSkip,
  shortcutEnabled,
  onShortcutEnabledChange,
}: GamePlayerProps) {
  const isHost = room.hostUserId === myUserId;
  const round = room.currentRound;
  const playerRef = useRef<YouTube>(null);
  const playedRoundRef = useRef<number | null>(null);
  const forceSkipRemaining = useCountdownSeconds(round?.forceSkipAt ?? null);

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

  // 방장이 라운드 종료(다음 라운드 대기) 상태일 때 Shift+→로 바로 다음 라운드를
  // 진행할 수 있게 한다. 화살표 키는 문자 입력/IME 조합과 무관해 채팅 입력창에
  // 포커스가 있어도 안전하게 동작한다.
  useEffect(() => {
    if (!isHost || room.gameStatus !== 'ROUND_ENDED' || !shortcutEnabled) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.shiftKey || event.code !== 'ArrowRight') {
        return;
      }

      event.preventDefault();
      onNextRound();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isHost, room.gameStatus, shortcutEnabled, onNextRound]);

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
  const hasRequestedForceSkip = round.forceSkipAt !== null;

  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl bg-gradient-to-br from-purple-100 to-purple-50 px-6 py-10">
      <p className="text-xs font-semibold text-purple-500">
        Round {round.roundIndex + 1} / {round.totalRounds}
      </p>

      <div className="relative h-[180px] w-[320px] overflow-hidden rounded-xl">
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

        {!isRevealedForMe && (
          <div className="absolute inset-0 flex items-center justify-center bg-purple-200">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-pink-400 text-2xl text-white shadow-lg">
              🎵
            </div>
          </div>
        )}
      </div>

      <div className="flex min-h-[132px] w-full flex-col items-center justify-center gap-2">
        {room.gameStatus === 'LOADING' && (
          <p className="text-sm text-slate-500">
            영상 로딩 중... 전원 완료되면 자동으로 재생돼요 (
            {round.readyUserIds.length}/{room.participants.length})
          </p>
        )}

        {room.gameStatus === 'PLAYING' && (
          <div className="flex flex-col items-center gap-2">
            <p className="text-sm text-slate-500">정답을 채팅창에 입력하세요</p>

            {hasRequestedForceSkip ? (
              <p className="text-xs font-semibold text-rose-400">
                {forceSkipRemaining ?? 0}초 후 라운드가 종료돼요
              </p>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onSkip}
                  disabled={round.skipUserIds.includes(myUserId)}
                  className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                >
                  {round.skipUserIds.includes(myUserId)
                    ? '스킵 요청함'
                    : '스킵'}{' '}
                  ({round.skipUserIds.length}/
                  {Math.floor(room.participants.length / 2) + 1})
                </button>

                {isHost && (
                  <button
                    type="button"
                    onClick={onForceSkip}
                    className="rounded-full border border-rose-200 bg-white px-4 py-1.5 text-xs font-semibold text-rose-400 transition hover:bg-rose-50"
                  >
                    강제 스킵
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {room.gameStatus === 'ROUND_ENDED' && (
          <div className="flex flex-col items-center gap-2">
            <p className="text-sm font-semibold text-slate-700">
              정답은 &quot;{round.songNm}&quot;({round.atstNm})였습니다!
            </p>
            {isHost && (
              <>
                <button
                  type="button"
                  onClick={onNextRound}
                  className="rounded-full bg-purple-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-purple-600"
                >
                  다음 라운드
                </button>
                <p className="text-xs text-slate-400">단축키: Shift + →</p>
                <label className="flex items-center gap-1.5 text-xs text-slate-400">
                  <input
                    type="checkbox"
                    checked={shortcutEnabled}
                    onChange={(event) =>
                      onShortcutEnabledChange(event.target.checked)
                    }
                    className="h-3.5 w-3.5 accent-purple-500"
                  />
                  단축키 사용
                </label>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
