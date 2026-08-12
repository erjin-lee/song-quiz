import { useEffect, useRef, useState } from 'react';
import YouTube, { type YouTubeEvent } from 'react-youtube';
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

/**
 * 재생 예정 시각(playScheduledAt)보다 이만큼 앞서 음소거 상태로 짧게 재생을
 * 시도해("프리버퍼링") 버퍼링/디코더 초기화를 미리 끝내둔다. 관측 결과 playVideo()
 * 호출부터 실제 PLAYING 전환까지의 지연(수백 ms) 대부분이 최초 버퍼링 비용이라,
 * 예정 시각 이전에 한 번 재생을 태워두면 예정 시각의 재생 재개 지연을 크게 줄일 수 있다.
 */
const PREBUFFER_LEAD_MS = 1200;
/**
 * 프리버퍼링 중 실제로 재생 상태를 유지하는 시간(버퍼링을 유도하기 위한 최소 시간).
 * 모바일 환경에서는 네트워크 상태에 따라 300ms 안에 버퍼링이 충분히 끝나지 않는
 * 경우가 있어(그 상태에서 예정 시각에 재생을 재개하면 소리가 잠깐 끊기는 문제로
 * 관측됨) 여유를 두고 500ms로 설정한다.
 */
const PREBUFFER_PLAY_MS = 500;

export interface PlaybackTriggeredDetails {
  roundIndex: number;
  /** 서버가 지정한 재생 예정 시각(ISO) */
  scheduledAt: string;
  /** 이 클라이언트가 실제로 playVideo()를 호출한, 서버 기준 보정 시각(ISO) */
  actualAt: string;
  /** actualAt - scheduledAt (ms). 0보다 크면 예정 시각보다 늦게 재생을 시도한 것이다. */
  deltaMs: number;
}

export interface PlaybackStartedDetails {
  roundIndex: number;
  /** 서버가 지정한 재생 예정 시각(ISO) */
  scheduledAt: string | null;
  /** 유튜브 플레이어가 실제로 PLAYING 상태가 된, 서버 기준 보정 시각(ISO) */
  actualAt: string;
  /** actualAt - scheduledAt (ms). null이면 scheduledAt을 알 수 없는 경우다. */
  deltaMs: number | null;
  /** actualAt - playVideo() 호출 시각 (ms). 버퍼링/네트워크 등으로 인한 순수 재생 지연이다. null이면 같은 라운드의 호출 시각을 알 수 없는 경우다. */
  commandToStartMs: number | null;
}

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
  /** 동시 재생 디버깅용: 실제로 playVideo()를 호출한 시점마다 호출된다(선택). */
  onPlaybackTriggered?: (details: PlaybackTriggeredDetails) => void;
  /** 동시 재생 디버깅용: 유튜브 플레이어가 실제로 PLAYING 상태가 된 시점마다 호출된다(라운드당 1회, 선택). */
  onPlaybackStarted?: (details: PlaybackStartedDetails) => void;
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
  onPlaybackTriggered,
  onPlaybackStarted,
}: GamePlayerProps) {
  const isHost = room.hostUserId === myUserId;
  const round = room.currentRound;
  const playerRef = useRef<YouTube>(null);
  const playedRoundRef = useRef<number | null>(null);
  const reportedReadyRoundRef = useRef<number | null>(null);
  // 동시 재생 디버깅용: playVideo()를 호출한 라운드/시각을 기억해뒀다가, 실제로
  // PLAYING 상태가 됐을 때 "명령 시점 → 실제 재생 시점" 지연을 계산하는 데 쓴다.
  const playbackCommandAtMsRef = useRef<{
    roundIndex: number;
    atMs: number;
  } | null>(null);
  const playbackStartReportedRoundRef = useRef<number | null>(null);
  // 프리버퍼링(음소거 재생→일시정지)을 이미 시도한 라운드를 기록해 중복 실행을 막는다.
  const prebufferedRoundRef = useRef<number | null>(null);
  // 프리버퍼링 중 "일시정지+위치복원+음소거해제"를 실행할 내부 타이머. 라운드 전환/
  // 언마운트 시 정리해야 하고, 이 타이머가 실제 재생(playedRoundRef)보다 늦게 발동하는
  // 경쟁 상태를 막기 위해 발동 시점에 playedRoundRef를 다시 확인한다.
  const prebufferPauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [isPlaying, setIsPlaying] = useState(false);
  // playScheduledAt에 도달해 실제로 재생을 "시도"한 시점부터 true. gameStatus가
  // PLAYING으로 바뀌는 시점(재생 예약 시각보다 최대 PLAY_SCHEDULE_DELAY_SECONDS만큼
  // 이르다)과는 다르다 — 그 사이에 수동 재생 버튼을 눌러버리면 동시 재생 취지가
  // 깨지므로, 정확히 자동재생을 시도하는 순간에 맞춰서만 버튼을 활성화한다.
  const [isPlayScheduleDue, setIsPlayScheduleDue] = useState(false);
  const forceSkipRemaining = useCountdownSeconds(
    round?.forceSkipAt ?? null,
    serverTimeOffsetMs,
  );
  // 스피드 모드: 첫 정답자가 나오면 자동 공개까지, 공개 후에는 자동 다음 라운드까지 남은 시간.
  const autoRevealRemaining = useCountdownSeconds(
    round?.autoRevealAt ?? null,
    serverTimeOffsetMs,
  );
  const autoNextRoundRemaining = useCountdownSeconds(
    round?.autoNextRoundAt ?? null,
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
  const startSec = round?.startSec ?? null;

  // 예정 시각보다 PREBUFFER_LEAD_MS만큼 앞서 음소거 상태로 짧게 재생→일시정지해
  // 버퍼링을 미리 끝내둔다. 재생 재개(unMute 후 실제 재생 타이머의 playVideo())는
  // 아래의 "실제 재생" effect가 그대로 담당한다 — 이 effect는 그 전 단계 준비만 한다.
  useEffect(() => {
    if (
      room.gameStatus !== 'PLAYING' ||
      roundIndex === null ||
      !playScheduledAt ||
      prebufferedRoundRef.current === roundIndex ||
      playedRoundRef.current === roundIndex
    ) {
      return;
    }

    const prebufferDelayMs =
      new Date(playScheduledAt).getTime() -
      PREBUFFER_LEAD_MS -
      (Date.now() + serverTimeOffsetMs);

    const startTimer = setTimeout(
      () => {
        prebufferedRoundRef.current = roundIndex;
        const player = playerRef.current?.getInternalPlayer();
        if (!player) {
          return;
        }

        player.mute();
        player.playVideo();

        prebufferPauseTimerRef.current = setTimeout(() => {
          prebufferPauseTimerRef.current = null;
          // 이 사이 실제 재생 타이머가 이미 발동해버렸다면(느린 네트워크 등으로
          // 프리버퍼링 자체가 예정 시각에 바짝 붙어 실행된 경우) 여기서 일시정지시키면
          // 진행 중인 실제 재생을 멈춰버리게 된다. 그 경우 실제 재생 타이머가 이미
          // unMute()까지 처리했으므로 아무것도 하지 않는다.
          if (playedRoundRef.current === roundIndex) {
            return;
          }
          player.pauseVideo();
          player.seekTo(startSec ?? 0, true);
          // 음소거 해제는 여기서 하지 않는다. 일시정지 상태로 예정 시각까지 대기하는
          // 동안 음소거를 미리 풀어두면(모바일 등 일부 환경에서) 재생 재개 순간에
          // 짧게 소리가 났다 끊기는 문제가 관측되어, 실제 재생 타이머가 playVideo()
          // 호출 직전에 unMute()하도록 그 시점을 뒤로 미룬다.
        }, PREBUFFER_PLAY_MS);
      },
      Math.max(0, prebufferDelayMs),
    );

    return () => {
      clearTimeout(startTimer);
      if (prebufferPauseTimerRef.current) {
        clearTimeout(prebufferPauseTimerRef.current);
        prebufferPauseTimerRef.current = null;
      }
    };
  }, [room.gameStatus, roundIndex, playScheduledAt, serverTimeOffsetMs, startSec]);

  useEffect(() => {
    if (
      room.gameStatus !== 'PLAYING' ||
      roundIndex === null ||
      !playScheduledAt ||
      playedRoundRef.current === roundIndex
    ) {
      return;
    }

    const delayMs =
      new Date(playScheduledAt).getTime() - (Date.now() + serverTimeOffsetMs);
    const timer = setTimeout(
      () => {
        playedRoundRef.current = roundIndex;
        setIsPlayScheduleDue(true);
        const player = playerRef.current?.getInternalPlayer();
        // 음소거 해제는 실제 재생을 시작하기 바로 직전, 여기서만 한다(프리버퍼링
        // 단계에서는 일부러 음소거를 풀지 않는다 — 위 프리버퍼링 effect 주석 참고).
        player?.unMute();
        player?.playVideo();

        const actualServerTimeMs = Date.now() + serverTimeOffsetMs;
        playbackCommandAtMsRef.current = {
          roundIndex,
          atMs: actualServerTimeMs,
        };

        if (onPlaybackTriggered) {
          onPlaybackTriggered({
            roundIndex,
            scheduledAt: playScheduledAt,
            actualAt: new Date(actualServerTimeMs).toISOString(),
            deltaMs: actualServerTimeMs - new Date(playScheduledAt).getTime(),
          });
        }
      },
      Math.max(0, delayMs),
    );

    return () => clearTimeout(timer);
  }, [
    room.gameStatus,
    roundIndex,
    playScheduledAt,
    serverTimeOffsetMs,
    onPlaybackTriggered,
  ]);

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

  // 라운드가 바뀌면(다음 곡) 이전 곡의 재생 상태 표시가 남아있지 않도록 초기화한다.
  useEffect(() => {
    setIsPlaying(false);
    setIsPlayScheduleDue(false);
  }, [roundIndex]);

  // 재생 상태를 추적해 중앙 아이콘(음표 ↔ 재생 버튼)에 반영한다. 브라우저 자동재생
  // 정책 때문에 예약된 playVideo() 호출이 조용히 막히는 경우가 있어(특히 새로고침
  // 직후처럼 이 페이지에서 아직 실제 클릭이 없었던 경우) 자동재생을 시도한
  // 시점(isPlayScheduleDue)부터 아직 실제로 재생되지 않았으면 아이콘을 클릭 가능한
  // 재생 버튼으로 보여준다 — 클릭 자체가 유저 제스처라 브라우저가 재생을 허용해준다.
  // 실제로 재생이 시작되면(PLAYING 이벤트) 다시 원래의 음표 아이콘으로 되돌린다.
  const handlePlayerStateChange = (event: YouTubeEvent<number>) => {
    if (event.data === YouTube.PlayerState.PLAYING) {
      setIsPlaying(true);

      if (
        onPlaybackStarted &&
        roundIndex !== null &&
        playbackStartReportedRoundRef.current !== roundIndex
      ) {
        playbackStartReportedRoundRef.current = roundIndex;
        const actualServerTimeMs = Date.now() + serverTimeOffsetMs;
        const command = playbackCommandAtMsRef.current;
        onPlaybackStarted({
          roundIndex,
          scheduledAt: playScheduledAt,
          actualAt: new Date(actualServerTimeMs).toISOString(),
          deltaMs: playScheduledAt
            ? actualServerTimeMs - new Date(playScheduledAt).getTime()
            : null,
          commandToStartMs:
            command && command.roundIndex === roundIndex
              ? actualServerTimeMs - command.atMs
              : null,
        });
      }
    } else if (
      event.data === YouTube.PlayerState.PAUSED ||
      event.data === YouTube.PlayerState.ENDED
    ) {
      setIsPlaying(false);
    }
  };

  const handlePlayClick = () => {
    playerRef.current?.getInternalPlayer()?.playVideo();
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
  const hasAutoReveal = round.autoRevealAt !== null;

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
            onStateChange={handlePlayerStateChange}
          />
        )}

        {!isRevealedForMe && (
          <div className="absolute inset-0 flex items-center justify-center bg-purple-200">
            {isPlaying ? (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-pink-400 text-2xl text-white shadow-lg">
                🎵
              </div>
            ) : (
              <button
                type="button"
                onClick={handlePlayClick}
                disabled={!isPlayScheduleDue}
                aria-label="재생"
                className={`flex h-16 w-16 items-center justify-center rounded-full text-2xl text-white shadow-lg transition ${
                  isPlayScheduleDue
                    ? 'cursor-pointer bg-pink-400 hover:bg-pink-500'
                    : 'cursor-not-allowed bg-pink-300/60 text-white/70'
                }`}
              >
                ▶
              </button>
            )}
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
            ) : hasAutoReveal ? (
              <p className="text-xs font-semibold text-pink-500">
                누군가 정답을 맞혔어요! {autoRevealRemaining ?? 0}초 후 정답이
                공개돼요
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
            {round.autoNextRoundAt && (
              <p className="text-xs font-semibold text-purple-400">
                {autoNextRoundRemaining ?? 0}초 후 다음 라운드로 자동
                진행돼요
              </p>
            )}
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
