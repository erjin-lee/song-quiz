import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { updateLogContext } from 'logger';
import { QuizClient, QuizRoundData } from './clients/quiz.client';
import { RoomItemDto } from './dto/room-item.dto';
import { RoundPublicStateDto } from './dto/round-public-state.dto';
import { RoomRepository } from './room.repository';
import { RoomTimerService } from './room-timer.service';

/** 한 라운드의 제한 시간. 이 시간이 지나면 전원이 못 맞춰도 라운드가 강제 종료된다. */
const ROUND_TIME_LIMIT_SECONDS = 30;
/**
 * 재생 시작 신호를 보낸 뒤 실제로 재생을 시작하기까지 주는 유예 시간.
 * 클라이언트마다 소켓 이벤트 수신 시각이 달라 즉시 재생하면 동시 재생이 어긋나므로,
 * 모두가 같은 미래 시각(now + 이 값)에 맞춰 재생을 시작하도록 예약한다.
 * 클라이언트가 clock offset을 보정해 재생 시각을 맞추므로, 소켓 전달 지연 편차만
 * 흡수하면 되는 짧은 값(1.8초)으로 충분하다.
 */
const PLAY_SCHEDULE_DELAY_SECONDS = Number(
  process.env.PLAY_SCHEDULE_DELAY_SECONDS ?? 1.8,
);
/** 스피드 모드에서 정답 공개 후 다음 라운드로 자동 전환되기까지의 유예 시간. */
const SPEED_MODE_NEXT_ROUND_DELAY_SECONDS = Number(
  process.env.SPEED_MODE_NEXT_ROUND_DELAY_SECONDS ?? 4,
);

/**
 * 라운드 진행 오케스트레이션(라운드 준비/시작/종료/전환, 라운드·스피드모드 타이머
 * 예약/취소)을 담당한다. room 상태 저장 자체(Redis get/set/delete)는
 * `RoomRepository`가, 결과를 소켓으로 알리는 것(EventEmitter emit)과 roomId별
 * 직렬화(withRoomLock)는 `RoomService`가 담당한다.
 */
@Injectable()
export class RoomRoundService {
  private readonly logger = new Logger(RoomRoundService.name);

  constructor(
    private readonly roomRepository: RoomRepository,
    private readonly roomTimerService: RoomTimerService,
    private readonly quizClient: QuizClient,
  ) {}

  /**
   * songOrder를 새로 구성하고, 게임 전체에서 쓸 라운드 데이터를 apps/api에서
   * 한 번에 스냅샷으로 받아 Redis에 캐시한 뒤 첫 라운드를 준비해 room을 LOADING
   * 상태로 만든다(room을 직접 변경한다). 라운드가 진행되는 동안(advanceToNextRound)
   * 에는 이 스냅샷만 읽고 apps/api를 다시 호출하지 않는다.
   */
  async prepareFirstRound(roomId: string, room: RoomItemDto): Promise<void> {
    // incrementPlayCount와 getQuizRounds는 서로 결과를 필요로 하지 않으므로 병렬로
    // 호출한다 — 순차 호출하면 apps/api 왕복 시간이 그대로 두 배로 게임 시작 지연에 더해진다.
    let allRounds: QuizRoundData[];
    try {
      const [, rounds] = await Promise.all([
        this.quizClient.incrementPlayCount(room.quizId),
        this.quizClient.getQuizRounds(room.quizId),
      ]);
      allRounds = rounds;
    } catch (err) {
      updateLogContext({ roomId });
      this.logger.error(
        `퀴즈 라운드 스냅샷 조회 실패(roomId: ${roomId}, quizId: ${room.quizId}): ${(err as Error).message}`,
        {
          event: 'quiz_snapshot_failed',
          errorCode: 'QUIZ_ROUNDS_FETCH_FAILED',
        },
      );
      throw err;
    }
    if (allRounds.length === 0) {
      throw new NotFoundException('퀴즈에 출제곡이 없습니다.');
    }

    // quizSeq ASC 순서로 온 전체 라운드를 셔플/슬라이스한다(셔플 자체는 게임 서비스
    // 로컬 관심사라 apps/api에 위임하지 않는다). songLimit이 songCount보다 작으면
    // 실제로 출제되는 곡만 스냅샷에 남겨 Redis 페이로드를 불필요하게 키우지 않는다.
    const ordered = room.isRandom ? this.shuffle(allRounds) : allRounds;
    const selectedRounds = ordered.slice(0, room.songLimit);
    const songOrder = selectedRounds.map((roundData) => roundData.quizSongId);
    const snapshot: Record<string, QuizRoundData> = {};
    for (const roundData of selectedRounds) {
      snapshot[roundData.quizSongId] = roundData;
    }

    await Promise.all([
      this.roomRepository.setSongOrder(roomId, songOrder),
      this.roomRepository.setRoundsSnapshot(roomId, snapshot),
    ]);
    room.gameStatus = 'LOADING';
    room.currentRound = await this.prepareRoundData(
      roomId,
      songOrder[0],
      0,
      songOrder.length,
    );
  }

  async recomputeReadyStatus(room: RoomItemDto): Promise<void> {
    const round = room.currentRound;
    if (!round || room.gameStatus !== 'LOADING') {
      return;
    }
    const allReady = room.participants.every((participant) =>
      round.readyUserIds.includes(participant.userId),
    );
    if (allReady) {
      await this.beginRound(room);
    }
  }

  /**
   * 전원 로딩 완료 시 별도 방장 조작 없이 곧바로 재생 상태로 전환한다.
   * 실제 재생은 즉시가 아니라 PLAY_SCHEDULE_DELAY_SECONDS 뒤로 예약해, 모든
   * 클라이언트가 이벤트 수신 시각과 무관하게 같은 시각에 재생을 시작하도록 한다.
   * 라운드 제한시간도 이 예약 시각 기준으로 흐르도록 그만큼 늦춰서 건다.
   * 타이머 예약이 실패하면(scheduleRoundTimer가 던짐) gameStatus를 PLAYING으로
   * 바꾼 것까지 포함해 이 호출 전체가 실패해야 한다 — 그래야 뒤이은 saveRoom이
   * 건너뛰어져 "타임아웃 없이 PLAYING으로 저장된" 상태가 생기지 않는다.
   */
  private async beginRound(room: RoomItemDto): Promise<void> {
    if (!room.currentRound) {
      return;
    }
    room.gameStatus = 'PLAYING';
    room.currentRound.playScheduledAt = new Date(
      Date.now() + PLAY_SCHEDULE_DELAY_SECONDS * 1000,
    ).toISOString();
    await this.scheduleRoundTimer(
      room.roomId,
      ROUND_TIME_LIMIT_SECONDS + PLAY_SCHEDULE_DELAY_SECONDS,
    );
  }

  /** 참가자 과반(절반 초과)이 스킵을 요청했는지 확인한다. */
  hasSkipMajority(room: RoomItemDto): boolean {
    const round = room.currentRound;
    if (!round) {
      return false;
    }
    const majorityThreshold = Math.floor(room.participants.length / 2) + 1;
    return round.skipUserIds.length >= majorityThreshold;
  }

  /**
   * 라운드를 종료(정답 공개) 상태로 만들고(room을 직접 변경), 스피드 모드면
   * "공개 후 자동 다음 라운드" 예약(speed-next)까지 만든다. 타임아웃/강제스킵/
   * 스킵과반/전원정답 등 어떤 경로로 호출되든 이 함수 하나로 모인다.
   *
   * round-timeout·speed-reveal 취소는 여기서 하지 않는다 — 호출자가 이 함수 뒤에
   * saveRoom까지 성공한 걸 확인한 다음 cleanupStaleRoundTimers를 불러야 한다. 이
   * 함수는 round-timeout/speed-reveal 핸들러 자신이 호출하는 경로도 있는데, saveRoom
   * 확인 전에 먼저 취소해버리면 saveRoom이 실패했을 때(Redis 단절 등) 그 핸들러
   * 자신의 claim과 새로 만든 speed-next까지 모두 사라져 방이 영구히 멈출 수 있다.
   * saveRoom이 실패하면 이 함수가 만든 speed-next와 기존 round-timeout/speed-reveal이
   * 모두 살아있는 채로 남고, 그중 먼저 발화하는 것이 이 함수를 처음부터 다시
   * 시도한다 — 이미 반영된 상태라면 각 핸들러의 gameStatus 가드가 no-op 처리한다.
   */
  async finalizeRoundEnd(room: RoomItemDto): Promise<void> {
    if (!room.currentRound) {
      return;
    }
    const reveal = await this.roomRepository.getCurrentReveal(room.roomId);
    room.currentRound.revealed = true;
    room.currentRound.songNm = reveal?.songNm ?? null;
    room.currentRound.atstNm = reveal?.atstNm ?? null;
    room.currentRound.albmNm = reveal?.albmNm ?? null;
    room.currentRound.quizSongId = reveal?.quizSongId ?? null;
    room.gameStatus = 'ROUND_ENDED';

    if (room.speedModeEnabled) {
      room.currentRound.autoNextRoundAt = new Date(
        Date.now() + SPEED_MODE_NEXT_ROUND_DELAY_SECONDS * 1000,
      ).toISOString();
      await this.scheduleSpeedModeTimer(
        room.roomId,
        'speed-next',
        SPEED_MODE_NEXT_ROUND_DELAY_SECONDS,
      );
    }
  }

  /**
   * finalizeRoundEnd로 라운드를 끝내고 그 room 상태 저장(saveRoom)까지 성공한
   * 직후에만 호출한다. round-timeout과(스피드 모드면) speed-reveal은 이제 쓸모없는
   * 안전 타이머이므로 정리하지만, 어디까지나 best-effort 정리라 실패해도 예외를
   * 던지지 않는다 — 핵심 상태는 이미 저장됐으니, 정리에 실패해도 스테일 타이머가
   * 한 번 더 헛돌고 각자의 gameStatus 가드로 no-op 처리될 뿐이다.
   */
  cleanupStaleRoundTimers(room: RoomItemDto): void {
    this.clearRoundTimer(room.roomId);
    if (room.speedModeEnabled) {
      this.roomTimerService.cancel('speed-reveal', room.roomId).catch((err) => {
        this.logger.warn(
          `스피드모드 타이머 취소 실패(speed-reveal, ${room.roomId}): ${(err as Error).message}`,
        );
      });
    }
  }

  /**
   * 스피드 모드 타이머를 예약한다. 예약(ZADD) 자체가 실패하면 호출자에게 그대로
   * 던진다 — 상태 저장만 성공하고 타이머는 유실되는 상황을 막기 위함이다
   * (RoomTimerService.schedule 참고). 'speed-reveal'과 'speed-next'가 같은 roomId에
   * 동시에 남아있을 위험은 예약 시점에 다른 kind를 미리 지우는 대신, 각 핸들러의
   * gameStatus 가드(PLAYING/ROUND_ENDED가 아니면 no-op)와 CAS 기반 자기 정리로
   * 감당한다 — finalizeRoundEnd 문서 참고.
   */
  async scheduleSpeedModeTimer(
    roomId: string,
    kind: 'speed-reveal' | 'speed-next',
    delaySeconds: number,
  ): Promise<void> {
    try {
      await this.roomTimerService.schedule(kind, roomId, delaySeconds);
    } catch {
      throw new ServiceUnavailableException(
        '타이머 예약에 실패했습니다. 잠시 후 다시 시도해주세요.',
      );
    }
  }

  clearSpeedModeTimer(roomId: string): void {
    this.roomTimerService.cancel('speed-reveal', roomId).catch((err) => {
      this.logger.warn(
        `스피드모드 타이머 취소 실패(speed-reveal, ${roomId}): ${(err as Error).message}`,
      );
    });
    this.roomTimerService.cancel('speed-next', roomId).catch((err) => {
      this.logger.warn(
        `스피드모드 타이머 취소 실패(speed-next, ${roomId}): ${(err as Error).message}`,
      );
    });
  }

  /** 다음 라운드를 준비하거나(있으면) 게임을 종료한다(없으면). room 객체를 직접 변경한다. */
  async advanceToNextRound(room: RoomItemDto): Promise<void> {
    const roomId = room.roomId;
    const songOrder = await this.roomRepository.getSongOrder(roomId);
    const nextIndex = (room.currentRound?.roundIndex ?? -1) + 1;

    if (nextIndex >= songOrder.length) {
      room.gameStatus = 'FINISHED';
      room.currentRound = null;
      await Promise.all([
        this.roomRepository.deleteSongOrder(roomId),
        this.roomRepository.deleteRoundsSnapshot(roomId),
        this.roomRepository.deleteCurrentAnswers(roomId),
        this.roomRepository.deleteCurrentReveal(roomId),
      ]);
      updateLogContext({ roomId });
      this.logger.log(`게임 종료됨(roomId: ${roomId})`, {
        event: 'game_finished',
      });
    } else {
      room.gameStatus = 'LOADING';
      room.currentRound = await this.prepareRoundData(
        roomId,
        songOrder[nextIndex],
        nextIndex,
        songOrder.length,
      );
    }
  }

  /**
   * 라운드 제한시간 타이머를 예약한다. RoomTimerService.schedule은 같은 kind+roomId면
   * score(발화 시각)만 덮어써 재예약이 곧 취소+재설정 효과를 내므로 별도로 먼저
   * 취소할 필요가 없다.
   * 예약(ZADD) 자체가 실패하면 호출자에게 그대로 던진다 — 상태 저장만 성공하고
   * 타이머는 유실되는 상황을 막기 위함이다(RoomTimerService.schedule 참고).
   */
  async scheduleRoundTimer(
    roomId: string,
    delaySeconds: number,
  ): Promise<void> {
    try {
      await this.roomTimerService.schedule(
        'round-timeout',
        roomId,
        delaySeconds,
      );
    } catch {
      throw new ServiceUnavailableException(
        '타이머 예약에 실패했습니다. 잠시 후 다시 시도해주세요.',
      );
    }
  }

  clearRoundTimer(roomId: string): void {
    this.roomTimerService.cancel('round-timeout', roomId).catch((err) => {
      this.logger.warn(
        `라운드 타이머 취소 실패(${roomId}): ${(err as Error).message}`,
      );
    });
  }

  private shuffle<T>(items: T[]): T[] {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  /**
   * 게임 시작 시 받아둔 라운드 스냅샷(setRoundsSnapshot)에서 이 라운드의 곡 데이터를
   * 읽어 currentAnswers/currentReveal 캐시를 채우고 공개 라운드 상태를 만든다. apps/api를
   * 다시 호출하지 않는다.
   */
  private async prepareRoundData(
    roomId: string,
    quizSongId: string,
    roundIndex: number,
    totalRounds: number,
  ): Promise<RoundPublicStateDto> {
    const snapshot = await this.roomRepository.getRoundsSnapshot(roomId);
    const roundData = snapshot[quizSongId];
    if (!roundData) {
      throw new NotFoundException(
        `출제곡을 찾을 수 없습니다. (quizSongId: ${quizSongId})`,
      );
    }

    await this.roomRepository.setCurrentAnswers(roomId, roundData.answers);
    await this.roomRepository.setCurrentReveal(roomId, {
      quizSongId: roundData.quizSongId,
      songNm: roundData.songNm,
      atstNm: roundData.atstNm,
      albmNm: roundData.albmNm,
    });

    return {
      roundIndex,
      totalRounds,
      youtubeVideoId: roundData.youtubeVideoId,
      startSec: roundData.startSec,
      endSec: roundData.endSec,
      readyUserIds: [],
      correctUserIds: [],
      skipUserIds: [],
      forceSkipAt: null,
      autoRevealAt: null,
      autoNextRoundAt: null,
      playScheduledAt: null,
      revealed: false,
      songNm: null,
      atstNm: null,
      albmNm: null,
      quizSongId: null,
    };
  }
}
