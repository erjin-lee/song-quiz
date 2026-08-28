import { Injectable, Logger } from '@nestjs/common';
import { RoomIndexRepository } from './room-index.repository';
import { roomLockKey, RoomRepository } from './room.repository';
import { RoomLockService } from './room-lock.service';

/**
 * room:index는 이제 만료시키지 않으므로(RoomIndexRepository), 방이 TTL로 자연
 * 만료돼 removeFromIndex를 못 탄 stale entry는 여기서만 정리된다. RoomService.getRooms가
 * 목록 표시 도중 "레코드가 없는 roomId"를 발견하면 이 클래스에 정리를 맡긴다.
 */
@Injectable()
export class RoomIndexReconciler {
  private readonly logger = new Logger(RoomIndexReconciler.name);

  constructor(
    private readonly roomRepository: RoomRepository,
    private readonly roomIndexRepository: RoomIndexRepository,
    private readonly roomLockService: RoomLockService,
  ) {}

  /**
   * 목록 조회 응답을 늦추지 않도록 기다리지 않고(fire-and-forget) 백그라운드에서
   * 지운다 — 실패해도 다음 조회에서 다시 시도되므로 결국 정리된다.
   */
  pruneStaleEntries(roomIds: string[]): void {
    for (const roomId of roomIds) {
      this.reconcileOne(roomId).catch((err) => {
        this.logger.warn(
          `만료된 방을 room:index에서 정리하지 못했습니다(roomId: ${roomId}): ${(err as Error).message}`,
        );
      });
    }
  }

  /**
   * getRooms()가 쓰는 getRoomRecord()는 Redis 오류 시 로컬 폴백으로 undefined를 반환할
   * 수 있다(목록 표시용으로는 안전하지만, 그 결과만으로 index에서 지우면 일시적인 Redis
   * 오류를 "방 만료"로 오인해 살아있는 방을 영구히 목록에서 지울 수 있다). 그래서 지우기
   * 전에 폴백 없는 roomExistsStrict로 한 번 더 확인한다 — 이 확인 자체가 실패하면(Redis
   * 오류) 판단을 유보하고 지우지 않는다(다음 조회에서 다시 시도).
   *
   * roomExistsStrict 확인과 removeFromIndex 사이에 room lock이 없으면, 그 틈에 다른
   * 작업(예: joinRoom)이 이미 이 roomId의 락을 쥔 채 방을 다시 저장(TTL 갱신)해도
   * 우리는 "없었다"는 낡은 판단으로 그 방을 index에서 지워버릴 수 있다. deleteRoom과
   * 동일하게 room lock으로 확인·삭제를 하나의 임계구역으로 묶어, 그 사이에는 어떤
   * saveRoom도 끼어들 수 없게 한다.
   */
  private async reconcileOne(roomId: string): Promise<void> {
    await this.roomLockService.withLock(roomLockKey(roomId), async () => {
      const stillExists = await this.roomRepository.roomExistsStrict(roomId);
      if (stillExists) {
        return;
      }
      await this.roomIndexRepository.removeFromIndex(roomId);
    });
  }
}
