import { useEffect, useRef, useState } from 'react';
import YouTube from 'react-youtube';
import { sortParticipantsByScore } from '../utils/participants';
import type { RoomItemDto } from '../types/room';

/**
 * onReady(플레이어/iframe 생성 완료) 이벤트가 이 시간 안에도 오지 않으면 방이 영구
 * 정지하지 않도록 강제로 ready 처리하는 유예 시간(LOADING 중엔 스킵 수단이 없음).
 * YouTube 플레이어의 실제 버퍼링 완료 상태(CUED 등)는 videoId를 생성자 옵션으로 바로
 * 넘기는 이 구성에서는 안정적으로 감지되지 않아(관측 결과 CUED가 거의 발생하지 않음),
 * 정밀하게 판별하려 하지 않고 iframe 로딩 여부만 러프하게 기준으로 삼는다.
 */
const READY_FALLBACK_TIMEOUT_MS = 8000;

interface GamePlayerProps {
  room: RoomItemDto;
  myUserId: string;
  serverTimeOffsetMs: number;
  onReady: () => void;
  onStartGame: () => void;
  onNextRound: () => void;
  onSkip: () => void;
  onForceSkip: () => void;
  shortcutEnabled: boolean;
  onShortcutEnabledChange: (enabled: boolean) => void;
}

// targetIso는 서버 기준 절대 시각이므로, 로컬 시계를 그대로 쓰지 않고 offsetMs로
// 보정한 "서버 기준 현재 시각"과 비교한다(재생 예약과 동일한 보정 방식).
function useCountdownSeconds(
  targetIso: string | null,
  offsetMs: number,
): number | null {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!targetIso) {
      setRemaining(null);
      return;
    }

    const target = new Date(targetIso).getTime();
    const tick = () => {
      setRemaining(
        Math.max(0, Math.ceil((target - (Date.now() + offsetMs)) / 1000)),
      );
    };
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [targetIso, offsetMs]);

  return remaining;
}

export function GamePlayer({
  room,
  myUserId,
  serverTimeOffsetMs,
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
  const reportedReadyRoundRef = useRef<number | null>(null);
  const forceSkipRemaining = useCountdownSeconds(
    round?.forceSkipAt ?? null,
    serverTimeOffsetMs,
  );

  // 재생 시작은 이벤트를 받는 즉시가 아니라, 서버가 지정한 예정 시각(playScheduledAt)에
  // 맞춰 실행한다. 클라이언트마다 소켓 이벤트 수신 시각이 달라 즉시 재생하면 유저별로
  // 재생 시점이 어긋나는데, 같은 목표 시각까지 각자 기다렸다가 재생하면 동시성이 개선된다.
  // Date.now()에 serverTimeOffsetMs를 더해 로컬 시계와 서버 시계의 오차를 보정한 "서버
  // 기준 현재 시각"을 추정한다(useServerClockOffset 훅 참고). offsetMs는 소켓 연결 이후
  // 비동기로 측정/갱신되므로 이 effect의 의존성에 포함시켜, 처음 스케줄링 시점에 아직
  // 측정 전(0)이었더라도 실제 offset이 도착하면 다시 정확한 지연으로 재예약되게 한다.
  // playedRoundRef는 "예약한 라운드"가 아니라 "실제로 재생을 시작한 라운드"를 기록해,
  // 재생 전까지는 offset이 갱신될 때마다 안전하게 재예약되고 재생 후에는 더 이상
  // (offset이 또 바뀌어도) 같은 영상을 다시 재생하지 않도록 한다.
  const roundIndex = round?.roundIndex ?? null;
  const playScheduledAt = round?.playScheduledAt ?? null;

  useEffect(() => {
    if (
      room.gameStatus !== 'PLAYING' ||
      roundIndex === null ||
      !playScheduledAt ||
      playedRoundRef.current === roundIndex
    ) {
      return;
    }
    console.log(serverTimeOffsetMs);
    console.log(playScheduledAt);

    const delayMs =
      new Date(playScheduledAt).getTime() - (Date.now() + serverTimeOffsetMs);
    const timer = setTimeout(
      () => {
        console.log(new Date().toISOString());
        playedRoundRef.current = roundIndex;
        playerRef.current?.getInternalPlayer()?.playVideo();
      },
      Math.max(0, delayMs),
    );

    return () => clearTimeout(timer);
  }, [room.gameStatus, roundIndex, playScheduledAt, serverTimeOffsetMs]);

  // ready 보고는 유튜브 플레이어(iframe)가 생성되면(onReady) 바로 한다. 실제 버퍼링
  // 완료 여부까지 정밀하게 확인하려던 시도(CUED 상태 감지)는 이 컴포넌트의 플레이어
  // 구성(videoId를 생성자 옵션으로 바로 전달)에서는 안정적으로 감지되지 않는 것으로
  // 확인되어(관측 결과 CUED가 거의 발생하지 않음, "실패"로 오판하는 원인이었다) 걷어내고,
  // iframe 로딩 여부만 러프하게 기준으로 삼는다. onReady 자체가 오지 않는 경우에 대비해
  // 유예 시간 후 강제로 ready 처리하는 안전장치만 유지한다.
  useEffect(() => {
    if (room.gameStatus !== 'LOADING' || roundIndex === null) {
      return;
    }
    if (reportedReadyRoundRef.current === roundIndex) {
      return;
    }

    const timer = setTimeout(() => {
      if (reportedReadyRoundRef.current !== roundIndex) {
        reportedReadyRoundRef.current = roundIndex;
        onReady();
      }
    }, READY_FALLBACK_TIMEOUT_MS);

    return () => clearTimeout(timer);
  }, [room.gameStatus, roundIndex, onReady]);

  const handlePlayerReady = () => {
    if (reportedReadyRoundRef.current !== roundIndex) {
      reportedReadyRoundRef.current = roundIndex;
      onReady();
    }
  };

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
    const ranked = sortParticipantsByScore(room.participants);
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
            onReady={handlePlayerReady}
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
