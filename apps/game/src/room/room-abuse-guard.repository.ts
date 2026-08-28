import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { CacheService } from '../cache/cache.service';

/**
 * 비밀방 비밀번호 대입 시도 제한. 공개방 입장이나 성공한 입장까지 함께 제한되지
 * 않도록, "실패한 비밀번호 시도"만 방(roomId) + 요청 IP 기준으로 집계한다.
 */
const PASSWORD_ATTEMPT_LIMIT = 5;
const PASSWORD_ATTEMPT_WINDOW_SECONDS = 60;
const PASSWORD_ATTEMPT_CACHE_KEY_PREFIX = 'room:pwd-attempts:';

/**
 * 공개 POST /rooms는 비로그인 게스트도 호출할 수 있고, isPrivate방은 생성마다
 * bcrypt.hash까지 돈다. IP당 방 생성 빈도를 제한해 반복 호출로 CPU(bcrypt)와
 * Redis(room 레코드 + index) 소비를 무한히 늘리는 것을 막는다.
 */
const ROOM_CREATION_LIMIT = 10;
const ROOM_CREATION_WINDOW_SECONDS = 60;
const ROOM_CREATION_CACHE_KEY_PREFIX = 'room:create-attempts:';

/**
 * INCR과 최초 1회의 EXPIRE를 한 Lua 실행으로 묶는다. GET → +1 → SET처럼 나누면 동시
 * 요청이 모두 같은 이전 값을 읽고 통과할 수 있어(단일 프로세스 안에서도 await 사이에
 * 요청이 교차한다), rate limit 자체가 우회된다.
 */
const INCR_WITH_EXPIRE_SCRIPT = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
end
return count
`;

/**
 * IP 기준 abuse 방지 카운터(비밀번호 대입 시도, 방 생성 속도)만 담당한다. room 상태
 * (fencing 보호가 필요한 room 레코드/index)와는 무관한 별도 관심사라 독립된 클래스로
 * 둔다.
 */
@Injectable()
export class RoomAbuseGuardRepository {
  private readonly logger = new Logger(RoomAbuseGuardRepository.name);

  /**
   * clientIp -> 방 생성 카운터(REDIS_HOST 미설정이거나 Redis가 순간 응답하지 못할 때의
   * 폴백). 단일 프로세스 내 Map 연산은 await 없이 동기로 끝나므로 그 자체로 원자적이다.
   */
  private readonly localRoomCreationCounts = new Map<
    string,
    { count: number; resetAt: number }
  >();

  constructor(private readonly cacheService: CacheService) {}

  private passwordAttemptKey(
    roomId: string,
    clientIp: string | undefined,
  ): string {
    return `${PASSWORD_ATTEMPT_CACHE_KEY_PREFIX}${roomId}:${clientIp ?? 'unknown'}`;
  }

  /** 이 방+IP 조합의 최근 실패 횟수가 한도를 넘었으면 429를 던진다(비밀번호 확인 전에 먼저 확인). */
  async assertPasswordAttemptAllowed(
    roomId: string,
    clientIp: string | undefined,
  ): Promise<void> {
    const key = this.passwordAttemptKey(roomId, clientIp);
    const attempts = (await this.cacheService.get<number>(key)) ?? 0;
    if (attempts >= PASSWORD_ATTEMPT_LIMIT) {
      throw new HttpException(
        '비밀번호 시도 횟수를 초과했습니다. 잠시 후 다시 시도해주세요.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /** 비밀번호가 틀렸을 때만 호출한다. 성공한 시도나 공개방 입장은 집계하지 않는다. */
  async recordFailedPasswordAttempt(
    roomId: string,
    clientIp: string | undefined,
  ): Promise<void> {
    const key = this.passwordAttemptKey(roomId, clientIp);
    const attempts = ((await this.cacheService.get<number>(key)) ?? 0) + 1;
    await this.cacheService.set(key, attempts, PASSWORD_ATTEMPT_WINDOW_SECONDS);
  }

  async clearPasswordAttempts(
    roomId: string,
    clientIp: string | undefined,
  ): Promise<void> {
    await this.cacheService.del(this.passwordAttemptKey(roomId, clientIp));
  }

  private roomCreationKey(clientIp: string | undefined): string {
    return `${ROOM_CREATION_CACHE_KEY_PREFIX}${clientIp ?? 'unknown'}`;
  }

  /**
   * IP당 방 생성 속도를 제한한다. bcrypt.hash나 Redis 쓰기를 하기 전, 요청 처리
   * 맨 앞에서 불러야 한도 초과 요청의 비용을 최소화할 수 있다.
   */
  async assertRoomCreationAllowed(clientIp: string | undefined): Promise<void> {
    const key = this.roomCreationKey(clientIp);
    const attempts = await this.incrementRoomCreationCounter(key);
    if (attempts > ROOM_CREATION_LIMIT) {
      throw new HttpException(
        '방 생성 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * GET → +1 → SET으로 나누면 동시 요청이 모두 같은 이전 값을 읽고 통과할 수 있어
   * (appendChatHistory와 같은 이유로 Redis eval을 쓴다). INCR+최초 EXPIRE를 하나의
   * Lua 실행으로 묶어 원자적으로 처리하고, Redis가 없거나 순간 응답하지 못하면
   * 로컬 카운터로 폴백한다.
   */
  private async incrementRoomCreationCounter(key: string): Promise<number> {
    const redis = this.cacheService.getRedisClient();
    if (redis && this.cacheService.isRedisReady()) {
      try {
        const count = await redis.eval(
          INCR_WITH_EXPIRE_SCRIPT,
          1,
          key,
          ROOM_CREATION_WINDOW_SECONDS,
        );
        return Number(count);
      } catch (err) {
        this.logger.warn(
          `방 생성 rate limit 카운터 Redis 갱신 실패, 로컬 카운터로 폴백합니다: ${(err as Error).message}`,
        );
      }
    }
    return this.incrementLocalRoomCreationCounter(key);
  }

  private incrementLocalRoomCreationCounter(key: string): number {
    const now = Date.now();
    const entry = this.localRoomCreationCounts.get(key);
    if (!entry || entry.resetAt <= now) {
      this.localRoomCreationCounts.set(key, {
        count: 1,
        resetAt: now + ROOM_CREATION_WINDOW_SECONDS * 1000,
      });
      return 1;
    }
    entry.count += 1;
    return entry.count;
  }
}
