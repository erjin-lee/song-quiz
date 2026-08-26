import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Redis } from 'ioredis';
import { CacheService, FenceGuard } from '../cache/cache.service';
import { delay } from '../common/delay';

/** 락을 쥐고 있는 동안 자동 만료되기까지의 시간. 임계구역(DB 쿼리 몇 개 + 캐시 get/set)은
 * 보통 수십~수백ms 안에 끝나므로 이 값은 그보다 훨씬 넉넉한 안전망이다. */
const LOCK_TTL_MS = 8_000;
/** TTL의 절반 주기로 하트비트를 보내 락을 연장한다. 드물게 임계구역이 오래 걸려도
 * 조기 만료로 다른 인스턴스가 락을 가로채는 것을 막는다. */
const LOCK_HEARTBEAT_MS = LOCK_TTL_MS / 2;
/**
 * 락 "경합"을 기다리는 전체 예산 — 즉 Redis는 정상인데 다른 워커가 락을 쥐고 있는
 * 상황에서만 쓴다. RoomTimerService의 RESERVATION_MS가 이 값에서 파생되므로
 * (§RoomTimerService), 이 값을 바꾸면 타이머 예약 시간도 함께 늘어난다.
 */
export const LOCK_ACQUIRE_TIMEOUT_MS = 12_000;
/**
 * Redis 자체에 닿지 않는 동안 재시도를 계속할 예산. 경합(LOCK_ACQUIRE_TIMEOUT_MS)과
 * 분리한 이유: 락을 쥔 워커를 기다리는 것은 언젠가 끝나는 생산적인 대기지만, Redis가
 * 죽어 있는 동안의 대기는 아무것도 진행시키지 못한 채 요청만 쌓는다. 그래서
 * "TCP 블립/짧은 재연결"만 흡수할 만큼만 기다린다 — ioredis의 retryStrategy가
 * 200ms/400ms/600ms 간격으로 재연결하므로 1초면 재연결 시도를 2~3번 덮는다.
 * 실시간 게임에서 소켓 액션 한 건이 1초 넘게 멈추면 사용자 눈에 그대로 보이고,
 * ElastiCache 페일오버처럼 수십 초짜리 장애는 어차피 기다려서 넘길 수 없다.
 */
const LOCK_REDIS_UNAVAILABLE_BUDGET_MS = 1_000;
const LOCK_RETRY_BASE_MS = 30;
const LOCK_RETRY_JITTER_MS = 30;
/** Redis에 닿지 않는 동안의 재시도 간격. 경합 재시도(30ms)보다 느슨하게 잡아 헛돌지 않게 한다. */
const LOCK_UNAVAILABLE_RETRY_BASE_MS = 100;
/**
 * lease 유효성 점검 주기. 하트비트 주기(4초)보다 촘촘해야 "TTL은 지났는데 다음
 * 하트비트 tick이 아직 안 와서 abort가 늦는" 구간이 생기지 않는다.
 */
const LEASE_CHECK_INTERVAL_MS = 1_000;
/**
 * fencing token 카운터의 TTL. 락 TTL(8초)보다 훨씬 길어야 한다 — 카운터가 사라지면
 * INCR이 1부터 다시 시작해 stale writer의 큰 token이 오히려 최신으로 보이기 때문이다.
 * 1시간 동안 그 key로 락을 한 번도 잡지 않았다면 8초짜리 lease를 든 stale worker가
 * 남아있을 수 없으므로 이 값이면 충분하다.
 */
const FENCE_TTL_MS = 60 * 60 * 1000;

/** SET NX 성공 시에만 fencing token을 발급(INCR)한다. 락 획득과 token 발급을 한 번의
 * 원자적 실행으로 묶어, 락은 잡았는데 token이 없는 중간 상태를 만들지 않는다. */
const ACQUIRE_SCRIPT = `
if redis.call("SET", KEYS[1], ARGV[1], "PX", ARGV[2], "NX") then
  local fence = redis.call("INCR", KEYS[2])
  redis.call("PEXPIRE", KEYS[2], ARGV[3])
  return fence
else
  return 0
end
`;

const RELEASE_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
else
  return 0
end
`;

const EXTEND_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("PEXPIRE", KEYS[1], ARGV[2])
else
  return 0
end
`;

/** 락 획득 실패 사유. 로그/에러의 errorCode로 그대로 쓴다. */
export type LockAcquireFailureCode =
  'LOCK_BUSY' | 'REDIS_UNAVAILABLE' | 'LOCK_ACQUIRE_TIMEOUT';

export class LockAcquireFailedError extends ServiceUnavailableException {
  constructor(
    readonly lockKey: string,
    readonly errorCode: LockAcquireFailureCode,
  ) {
    super(
      `분산 락 획득에 실패했습니다(key: ${lockKey}). 잠시 후 다시 시도해주세요.`,
    );
  }
}

/** lease를 잃은(=상호배제를 더 이상 보장할 수 없는) 상태에서 임계구역이 계속됐을 때. */
export class LockLeaseLostError extends ServiceUnavailableException {
  readonly errorCode = 'ROOM_LOCK_LEASE_LOST';

  constructor(
    readonly lockKey: string,
    readonly reason: LeaseLostReason,
  ) {
    super(
      `분산 락 lease를 잃어 작업을 중단했습니다(key: ${lockKey}, reason: ${reason}).`,
    );
  }
}

/**
 * 어떤 key를 그 key를 보호하지 않는 락 아래에서 쓰려 했을 때. fencing token은 "락
 * 하나당 하나"라, 엉뚱한 락 아래에서 쓰면 검사는 통과하지만(카운터는 단조 증가하므로)
 * 정작 그 key에 대한 직렬화는 전혀 이뤄지지 않는다 — 조용히 통과시키면 fencing이
 * 있다는 착각만 남으므로 프로그래밍 오류로 보고 막는다.
 */
export class LockScopeMismatchError extends ServiceUnavailableException {
  readonly errorCode = 'LOCK_SCOPE_MISMATCH';

  constructor(
    readonly heldLockKey: string,
    readonly expectedLockKey: string,
  ) {
    super(
      `이 키를 보호하지 않는 락 아래에서 상태를 변경하려 했습니다(held: ${heldLockKey}, expected: ${expectedLockKey}).`,
    );
  }
}

/** 이미 더 새로운 fencing token이 발급돼 Redis가 쓰기를 거부했을 때. */
export class StaleFencingWriteError extends ServiceUnavailableException {
  readonly errorCode = 'STALE_FENCING_WRITE';

  constructor(readonly cacheKey: string) {
    super(
      `오래된 fencing token으로 상태를 쓰려다 거부되었습니다(key: ${cacheKey}).`,
    );
  }
}

/** acquire()의 결과. errorCode가 null이면 성공이고, 그때만 fence/acquiredAt이 유효하다. */
interface AcquireResult {
  fence: number | null;
  acquiredAt: number;
  errorCode: LockAcquireFailureCode | null;
}

export type LeaseLostReason =
  /** lastSuccessfulRenewal + TTL을 넘겼다 — 갱신이 제때 되지 않았다. */
  | 'LEASE_EXPIRED'
  /** Redis가 "이 key는 네 token이 아니다"라고 답했다 — 이미 만료됐거나 남이 점유했다. */
  | 'LOCK_NOT_HELD';

/**
 * 락을 쥔 동안의 임차 상태. 유효성 판단은 "연속 N회 실패"가 아니라 마지막으로 실제
 * 연장에 성공한 시각(lastSuccessfulRenewalAt) + TTL 기준이다 — 하트비트가 몇 번
 * 실패했는지는 Redis 서버가 key를 언제 지우는지와 아무 관계가 없고, 실제 만료 시각을
 * 결정하는 것은 마지막으로 PEXPIRE가 실제로 실행된 시점뿐이기 때문이다.
 */
export class LockLease {
  private readonly abortController = new AbortController();
  private lastSuccessfulRenewalAt: number;
  private leaseValidUntil: number;
  private lostReason: LeaseLostReason | null = null;

  constructor(
    readonly lockKey: string,
    readonly token: string,
    /** 로컬 폴백 모드에서는 fencing이 없으므로 null. */
    readonly fence: number | null,
    readonly fenceKey: string | null,
    acquiredAt: number,
    /** 로컬 폴백 모드에서는 Infinity — 프로세스 내 체이닝이라 만료 개념이 없다. */
    private readonly ttlMs: number,
  ) {
    this.lastSuccessfulRenewalAt = acquiredAt;
    this.leaseValidUntil = acquiredAt + ttlMs;
  }

  get signal(): AbortSignal {
    return this.abortController.signal;
  }

  get lost(): boolean {
    return this.lostReason !== null;
  }

  get reason(): LeaseLostReason | null {
    return this.lostReason;
  }

  get validUntil(): number {
    return this.leaseValidUntil;
  }

  get lastRenewalAt(): number {
    return this.lastSuccessfulRenewalAt;
  }

  isValid(now: number = Date.now()): boolean {
    return this.lostReason === null && now < this.leaseValidUntil;
  }

  /**
   * 하트비트를 보내야 하는 시점인지. 기준을 "마지막 시도"가 아니라 "마지막 성공"으로
   * 잡는다 — 시도 기준이면 t=4s의 연장이 실패했을 때 다음 시도가 t=8s(=이미 만료된
   * 뒤)가 되어, 1~2초짜리 blip조차 살아남지 못한다. 성공 기준이면 실패한 다음
   * 점검 주기(1초)마다 곧바로 재시도하므로 짧은 장애는 TTL 안에서 회복된다.
   */
  needsRenewal(now: number): boolean {
    return now - this.lastSuccessfulRenewalAt >= LOCK_HEARTBEAT_MS;
  }

  /**
   * PEXPIRE는 Redis 서버가 커맨드를 "처리한" 시점부터 TTL을 다시 세므로 실제 만료
   * 시각은 항상 sentAt + TTL 이후다. 보수적으로 보낸 시각을 기준 삼아, 우리가 계산한
   * 유효기간이 서버의 실제 유효기간을 절대 넘어서지 않게 한다.
   */
  markRenewed(sentAt: number): void {
    if (this.lostReason !== null || sentAt <= this.lastSuccessfulRenewalAt) {
      return;
    }
    this.lastSuccessfulRenewalAt = sentAt;
    this.leaseValidUntil = sentAt + this.ttlMs;
  }

  /** 처음 lease를 잃은 호출에서만 true를 반환한다(중복 로깅 방지). */
  markLost(reason: LeaseLostReason): boolean {
    if (this.lostReason !== null) {
      return false;
    }
    this.lostReason = reason;
    this.abortController.abort(new LockLeaseLostError(this.lockKey, reason));
    return true;
  }
}

/**
 * roomId 등 임의의 key에 대한 작업을 인스턴스 간에도 직렬화하는 분산 락.
 * REDIS_HOST가 설정돼 있으면 Redis 기반 분산 락을, 아니면(로컬 개발 등) 기존
 * RoomService.roomLocks와 동일한 in-memory Promise 체이닝으로 동작한다.
 * 두 모드는 프로세스 시작 시 1회만 결정하고 이후 바꾸지 않는다 — 매 호출마다
 * Redis 연결 상태로 모드를 흔들면 스케줄/취소가 어긋나는 문제가 RoomTimerService와
 * 동일하게 발생할 수 있기 때문이다.
 *
 * Redis 장애가 락 TTL보다 길어지면 Redis 서버 쪽에서 락 key가 그냥 사라져 상호배제가
 * 깨진다. 이때 임계구역이 아무것도 모른 채 계속 실행되면 다른 인스턴스가 새로 잡은
 * 락과 나란히 room 상태를 덮어쓰게 되므로, 이 서비스는 다음 3중 방어를 둔다.
 * 1. lease: 마지막 갱신 성공 시각 + TTL이 지나면 LOCK_LOST로 판정하고 abort한다.
 * 2. write boundary: 상태 쓰기 직전에 assertLeaseHeld()로 한 번 더 확인한다
 *    (AbortSignal은 이미 시작된 await를 되돌리지 못하므로 신호만으로는 부족하다).
 * 3. fencing token: 락 획득 시 monotonic token을 발급하고, 쓰기를 Lua로 원자 검사해
 *    더 새로운 token이 이미 발급됐다면 Redis 쪽에서 거부한다.
 */
@Injectable()
export class RoomLockService implements OnModuleDestroy {
  private readonly logger = new Logger(RoomLockService.name);
  private readonly redisConfigured: boolean;
  /** 로컬 폴백 모드 전용: key -> 대기 중인 작업 체인. */
  private readonly localChains = new Map<string, Promise<unknown>>();
  /**
   * 현재 실행 중인 임계구역의 lease. 14개 withLock 호출부와 RoomRepository의 모든
   * 쓰기 메서드에 handle 인자를 실어 나르는 대규모 시그니처 변경 대신, 이미 이
   * 코드베이스가 쓰고 있는 AsyncLocalStorage(logger의 LogContext와 같은 방식)로
   * ambient 전달한다. 중첩 락(room 락 안에서 room-index 락)도 run() 스코프가
   * 알아서 안쪽/바깥쪽 lease를 구분해준다.
   */
  private readonly leaseStorage = new AsyncLocalStorage<LockLease>();

  constructor(private readonly cacheService: CacheService) {
    this.redisConfigured = this.cacheService.getRedisClient() !== null;
  }

  onModuleDestroy(): void {
    this.localChains.clear();
  }

  async withLock<T>(
    key: string,
    task: (lease: LockLease) => Promise<T>,
  ): Promise<T> {
    if (this.redisConfigured) {
      return this.withRedisLock(key, task);
    }
    return this.withLocalLock(key, task);
  }

  /** 지금 실행 중인 임계구역의 lease(없으면 undefined). */
  getCurrentLease(): LockLease | undefined {
    return this.leaseStorage.getStore();
  }

  /**
   * 상태 쓰기 직전 방어선. 락 안에서 실행 중인데 lease가 이미 만료됐다면 쓰기를 막는다.
   * 락 밖에서 호출된 경우(예: 아직 아무도 모르는 새 roomId를 만드는 createRoom)에는
   * 보호할 상호배제 자체가 없으므로 통과시킨다.
   */
  assertLeaseHeld(): void {
    const lease = this.getCurrentLease();
    if (!lease) {
      return;
    }
    if (lease.isValid()) {
      return;
    }
    this.loseLease(lease, lease.reason ?? 'LEASE_EXPIRED');
    throw new LockLeaseLostError(
      lease.lockKey,
      lease.reason ?? 'LEASE_EXPIRED',
    );
  }

  /**
   * 지금 임계구역의 fencing 가드(로컬 폴백 모드이거나 락 밖이면 null).
   *
   * expectedLockKey는 "지금 쓰려는 key를 실제로 보호하는 락"이다. 중첩 락에서는
   * ambient lease가 가장 안쪽 락의 것이므로(room 락 안에서 room-index 락을 잡으면
   * 그 안의 쓰기는 room-index lease를 본다), 쓰기 대상과 락이 어긋나면 엉뚱한
   * fencing 카운터를 검사하게 된다. 그래서 호출부가 기대하는 락 키를 명시하게 하고
   * 여기서 대조한다 — 중첩이 늘어나도 fencing이 조용히 무력화되지 않는다.
   */
  getFenceGuard(expectedLockKey: string): FenceGuard | null {
    const lease = this.getCurrentLease();
    if (!lease) {
      return null;
    }
    if (lease.lockKey !== this.toLockKey(expectedLockKey)) {
      throw new LockScopeMismatchError(lease.lockKey, expectedLockKey);
    }
    if (lease.fence === null || lease.fenceKey === null) {
      return null;
    }
    return { key: lease.fenceKey, token: lease.fence };
  }

  private toLockKey(key: string): string {
    return `lock:${key}`;
  }

  private async withRedisLock<T>(
    key: string,
    task: (lease: LockLease) => Promise<T>,
  ): Promise<T> {
    const redis = this.cacheService.getRedisClient();
    if (!redis) {
      // redisConfigured는 부팅 시점 값이라 이론상 여기 도달할 일은 없지만,
      // 타입 안전을 위해 방어적으로 처리한다.
      throw new ServiceUnavailableException(
        'Redis 클라이언트를 사용할 수 없습니다.',
      );
    }

    const lockKey = this.toLockKey(key);
    const fenceKey = `lock:fence:${key}`;
    const token = randomUUID();

    const acquired = await this.acquire(redis, lockKey, fenceKey, token);
    if (acquired.errorCode !== null) {
      this.logger.warn(`분산 락 획득 최종 실패(key: ${key})`, {
        event: 'redis_lock_failed',
        errorCode: acquired.errorCode,
      });
      throw new LockAcquireFailedError(key, acquired.errorCode);
    }

    const lease = new LockLease(
      lockKey,
      token,
      acquired.fence,
      fenceKey,
      acquired.acquiredAt,
      LOCK_TTL_MS,
    );
    const monitor = this.startLeaseMonitor(redis, lease);

    try {
      const result = await this.leaseStorage.run(lease, () => task(lease));
      // 임계구역이 끝까지 돌긴 했지만 도중에 lease를 잃었다면 그 구간의 실행은
      // 상호배제가 보장되지 않았다. 성공으로 위장하지 않고 fail-closed 한다.
      if (!lease.isValid()) {
        this.loseLease(lease, lease.reason ?? 'LEASE_EXPIRED');
        throw new LockLeaseLostError(lockKey, lease.reason ?? 'LEASE_EXPIRED');
      }
      return result;
    } finally {
      clearInterval(monitor);
      await this.release(redis, lease);
    }
  }

  /**
   * Redis 장애 예산(LOCK_REDIS_UNAVAILABLE_BUDGET_MS)과 경합 예산
   * (LOCK_ACQUIRE_TIMEOUT_MS)을 따로 두고 재시도한다. 첫 실패에 바로 포기하지 않아
   * 짧은 blip은 흡수하되, 두 예산 모두 상한이 있어 무한 재시도는 하지 않는다.
   */
  private async acquire(
    redis: Redis,
    lockKey: string,
    fenceKey: string,
    token: string,
  ): Promise<AcquireResult> {
    const contentionDeadline = Date.now() + LOCK_ACQUIRE_TIMEOUT_MS;
    /** Redis에 마지막으로 "닿지 못하기 시작한" 시각. 커맨드가 한 번이라도 응답하면 초기화한다. */
    let unavailableSince: number | null = null;
    let commandErrors = 0;

    while (Date.now() < contentionDeadline) {
      if (!this.cacheService.isRedisReady()) {
        unavailableSince ??= Date.now();
        if (Date.now() - unavailableSince >= LOCK_REDIS_UNAVAILABLE_BUDGET_MS) {
          return { fence: null, acquiredAt: 0, errorCode: 'REDIS_UNAVAILABLE' };
        }
        await delay(this.retryDelayMs(true));
        continue;
      }

      const attemptedAt = Date.now();
      try {
        const fence = await redis.eval(
          ACQUIRE_SCRIPT,
          2,
          lockKey,
          fenceKey,
          token,
          LOCK_TTL_MS,
          FENCE_TTL_MS,
        );
        // 커맨드가 응답했다 = Redis에 닿았다. 장애 예산을 초기화한다.
        unavailableSince = null;
        if (typeof fence === 'number' && fence > 0) {
          return { fence, acquiredAt: attemptedAt, errorCode: null };
        }
      } catch (err) {
        commandErrors += 1;
        unavailableSince ??= Date.now();
        if (Date.now() - unavailableSince >= LOCK_REDIS_UNAVAILABLE_BUDGET_MS) {
          return { fence: null, acquiredAt: 0, errorCode: 'REDIS_UNAVAILABLE' };
        }
        this.logger.warn(
          `분산 락 획득 시도 중 Redis 오류(${lockKey}): ${(err as Error).message}`,
        );
      }
      await delay(this.retryDelayMs(unavailableSince !== null));
    }

    // 예산 전체를 깨끗한 "이미 점유됨" 응답만 받으며 소진했다면 순수 경합이다.
    return {
      fence: null,
      acquiredAt: 0,
      errorCode: commandErrors === 0 ? 'LOCK_BUSY' : 'LOCK_ACQUIRE_TIMEOUT',
    };
  }

  private retryDelayMs(unavailable: boolean): number {
    const base = unavailable
      ? LOCK_UNAVAILABLE_RETRY_BASE_MS
      : LOCK_RETRY_BASE_MS;
    return base + Math.random() * LOCK_RETRY_JITTER_MS;
  }

  /**
   * 하트비트 발사와 lease 만료 판정을 한 타이머에서 함께 처리한다. 만료 판정을
   * 하트비트 주기(4초)에 얹으면 "TTL은 이미 지났는데 abort는 다음 tick에야 되는"
   * 구간이 생기므로, 더 촘촘한 주기로 돌면서 필요할 때만 EXTEND를 보낸다.
   */
  private startLeaseMonitor(redis: Redis, lease: LockLease): NodeJS.Timeout {
    let renewalInFlight = false;

    const monitor = setInterval(() => {
      const now = Date.now();
      if (lease.lost) {
        return;
      }
      if (!lease.isValid(now)) {
        this.loseLease(lease, 'LEASE_EXPIRED');
        return;
      }
      if (renewalInFlight || !lease.needsRenewal(now)) {
        return;
      }

      renewalInFlight = true;
      redis
        .eval(EXTEND_SCRIPT, 1, lease.lockKey, lease.token, LOCK_TTL_MS)
        .then((extended) => {
          if (extended === 1) {
            lease.markRenewed(now);
            return;
          }
          // Redis가 응답했는데 우리 token이 아니다 = 이미 만료됐거나 남이 잡았다.
          // 남은 TTL을 더 기다릴 이유가 없으므로 즉시 lease를 잃은 것으로 본다.
          this.loseLease(lease, 'LOCK_NOT_HELD');
        })
        .catch((err) => {
          // 여기서는 아직 lease를 잃었다고 단정하지 않는다 — Redis가 잠깐 응답하지
          // 못했을 뿐 서버의 key는 아직 살아있을 수 있다. 판정은 만료 시각이 한다.
          this.logger.warn(
            `분산 락 연장 실패(${lease.lockKey}): ${(err as Error).message}`,
            {
              event: 'redis_lock_renew_failed',
              errorCode: 'LOCK_RENEW_FAILED',
            },
          );
        })
        .finally(() => {
          renewalInFlight = false;
        });
    }, LEASE_CHECK_INTERVAL_MS);
    monitor.unref();
    return monitor;
  }

  private loseLease(lease: LockLease, reason: LeaseLostReason): void {
    if (!lease.markLost(reason)) {
      return;
    }
    this.logger.error(
      `분산 락 lease를 잃었습니다(${lease.lockKey}, reason: ${reason}). ` +
        '이 시점 이후의 상태 쓰기는 차단됩니다.',
      { event: 'room_lock_lease_lost', errorCode: 'ROOM_LOCK_LEASE_LOST' },
    );
  }

  private async release(redis: Redis, lease: LockLease): Promise<void> {
    try {
      const released = await redis.eval(
        RELEASE_SCRIPT,
        1,
        lease.lockKey,
        lease.token,
      );
      // lease를 잃은 경우엔 이미 room_lock_lease_lost로 보고했으므로 중복 보고하지 않는다.
      if (released !== 1 && !lease.lost) {
        this.logger.error(
          `분산 락 해제 시 토큰 불일치(${lease.lockKey}): 이미 TTL 만료 후 다른 인스턴스가 점유했을 수 있습니다.`,
          { event: 'room_lock_lease_lost', errorCode: 'ROOM_LOCK_LEASE_LOST' },
        );
      }
    } catch (err) {
      this.logger.warn(
        `분산 락 해제 실패(${lease.lockKey}): ${(err as Error).message}`,
      );
    }
  }

  /**
   * 기존 RoomService.withRoomLock과 동일한 Promise 체이닝 방식(단일 프로세스 내 직렬화).
   * 단일 프로세스 안에서만 도는 체인이라 만료도 fencing도 필요 없지만, 호출부가
   * 모드에 따라 갈라지지 않도록 항상 유효한 lease를 세워둔다.
   */
  private async withLocalLock<T>(
    key: string,
    task: (lease: LockLease) => Promise<T>,
  ): Promise<T> {
    const previous = this.localChains.get(key) ?? Promise.resolve();
    const run = previous
      .catch(() => undefined)
      .then(() => {
        const lease = new LockLease(
          this.toLockKey(key),
          randomUUID(),
          null,
          null,
          Date.now(),
          Number.POSITIVE_INFINITY,
        );
        return this.leaseStorage.run(lease, () => task(lease));
      });
    this.localChains.set(
      key,
      run.catch(() => undefined),
    );
    return run;
  }
}
