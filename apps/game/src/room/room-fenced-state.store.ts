import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from '../cache/cache.service';
import { RoomLockService, StaleFencingWriteError } from './room-lock.service';

/**
 * 여러 인스턴스가 공유하는 room 도메인 상태(방 레코드, 라운드 진행 데이터,
 * room:index)를 lease 검사 + fencing 검증을 거쳐 쓰고 지우는 단일 통로.
 * RoomRepository와 RoomIndexRepository가 이 클래스 하나를 공유해서 쓴다 —
 * 각자 이 검사를 복제하면 한쪽만 고치고 다른 쪽을 놓치는 실수가 나기 쉽다.
 *
 * 1. assertLeaseHeld: Redis 장애가 락 TTL보다 길어져 lease가 만료됐다면 여기서
 *    막는다. AbortSignal은 이미 진행 중인 await를 되돌리지 못하므로, 실제 쓰기
 *    직전에 다시 확인하는 이 경계가 마지막 방어선이다.
 * 2. fencing: 우리 인스턴스가 lease 만료를 아직 감지하지 못한 상태에서 뒤늦게
 *    쓰기를 시도해도, 이미 더 새로운 token이 발급됐다면 Redis가 원자적으로 거부한다.
 *
 * lockKey에는 "이 key를 보호하는 락"을 넘긴다. 중첩 락에서 ambient lease가 가장
 * 안쪽 락의 것이 되므로, 이 값이 있어야 엉뚱한 fencing 카운터를 검사하는 일을
 * RoomLockService가 잡아낼 수 있다.
 */
@Injectable()
export class RoomFencedStateStore {
  private readonly logger = new Logger(RoomFencedStateStore.name);

  constructor(
    private readonly cacheService: CacheService,
    private readonly roomLockService: RoomLockService,
  ) {}

  async writeSharedState<T>(
    key: string,
    value: T,
    ttlSeconds: number,
    lockKey: string,
  ): Promise<void> {
    this.roomLockService.assertLeaseHeld();

    const accepted = await this.cacheService.setStrictFenced(
      key,
      value,
      ttlSeconds,
      this.roomLockService.getFenceGuard(lockKey),
    );
    this.assertFencedOperationAccepted(accepted, key, '상태 쓰기');
  }

  /**
   * writeSharedState의 삭제판. 삭제도 상태를 바꾸는 쓰기이므로 같은 방어를 받는다 —
   * 이게 없으면 lease를 잃은 워커가 뒤늦게 정리(deleteRoom, 게임 종료 시 라운드 데이터
   * 정리)에 들어가, 그 사이 새 락을 잡은 워커가 기록한 상태를 지워버릴 수 있다.
   */
  async deleteSharedState(key: string, lockKey: string): Promise<void> {
    this.roomLockService.assertLeaseHeld();

    const accepted = await this.cacheService.delStrictFenced(
      key,
      this.roomLockService.getFenceGuard(lockKey),
    );
    this.assertFencedOperationAccepted(accepted, key, '상태 삭제');
  }

  private assertFencedOperationAccepted(
    accepted: boolean,
    key: string,
    operation: string,
  ): void {
    if (accepted) {
      return;
    }
    this.logger.error(
      `더 새로운 fencing token이 이미 발급되어 ${operation}를 거부했습니다(${key}).`,
      {
        event: 'stale_fencing_write_rejected',
        errorCode: 'STALE_FENCING_WRITE',
      },
    );
    throw new StaleFencingWriteError(key);
  }
}
