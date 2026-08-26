/**
 * 테스트 전용 in-memory Redis 대역. 분산 락/fencing 경로는 실제로 Lua 스크립트의
 * 원자성에 기대고 있어서, get/set만 흉내내는 mock으로는 "락 TTL은 만료됐는데 워커는
 * 아직 자기가 락을 쥐고 있다고 믿는" 중간 상태를 재현할 수 없다. 그래서 여기서는 각
 * 스크립트를 그 스크립트가 하는 일 그대로 해석해준다.
 *
 * `down` 플래그로 Redis 장애를 재현한다 — ioredis가 연결이 끊겼을 때 커맨드를
 * reject하는 것과 같은 형태로 실패시킨다.
 */
export class FakeRedis {
  private readonly values = new Map<string, string>();
  private readonly expiresAt = new Map<string, number>();

  /** true면 모든 커맨드가 실패한다(연결 끊김 재현). */
  down = false;
  /**
   * true면 get/set/del만 실패하고 eval(락)은 정상 동작한다. "락은 잡혔는데 그 안에서
   * 상태를 읽고 쓰지 못하는" 부분 장애를 만들어, 상태 경로가 로컬로 폴백하지 않고
   * 제대로 실패하는지만 따로 검증할 때 쓴다.
   */
  dataCommandsDown = false;
  /** 실행된 스크립트 종류 기록. 하트비트가 실제로 몇 번 나갔는지 확인할 때 쓴다. */
  readonly evalKinds: string[] = [];

  async get(key: string): Promise<string | null> {
    this.assertDataCommandsUp();
    this.sweep();
    return this.values.get(key) ?? null;
  }

  async set(
    key: string,
    value: string,
    _mode?: string,
    ttlSeconds?: number,
  ): Promise<'OK'> {
    this.assertDataCommandsUp();
    this.values.set(key, value);
    if (ttlSeconds !== undefined) {
      this.expiresAt.set(key, Date.now() + Number(ttlSeconds) * 1000);
    }
    return 'OK';
  }

  async del(key: string): Promise<number> {
    this.assertDataCommandsUp();
    const existed = this.values.delete(key);
    this.expiresAt.delete(key);
    return existed ? 1 : 0;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async eval(script: string, numKeys: number, ...args: any[]): Promise<number> {
    this.assertUp();
    this.sweep();

    const keys = args.slice(0, numKeys).map(String);
    const argv = args.slice(numKeys).map(String);

    // 스크립트 본문을 export해서 테스트가 프로덕션 상수에 결합되지 않도록, 각
    // 스크립트에만 등장하는 토큰으로 분기한다.
    // fencing 스크립트를 먼저 걸러야 한다 — FENCED_DEL_SCRIPT는 DEL도 함께 담고
    // 있어서 순서를 바꾸면 락 해제(RELEASE_SCRIPT)로 오인된다.
    if (script.includes('tonumber(latest)')) {
      // fencing이 붙은 상태 쓰기/삭제도 "상태 커맨드"로 취급한다 — 락은 살아있는데
      // 상태 조작만 실패하는 부분 장애를 재현할 수 있어야 하기 때문이다.
      this.assertDataCommandsUp();
      if (script.includes('DEL')) {
        this.evalKinds.push('fenced-del');
        return this.fencedDel(keys, argv);
      }
      this.evalKinds.push('fenced-set');
      return this.fencedSet(keys, argv);
    }
    if (script.includes('INCR')) {
      this.evalKinds.push('acquire');
      return this.acquire(keys, argv);
    }
    if (script.includes('DEL')) {
      this.evalKinds.push('release');
      return this.release(keys, argv);
    }
    if (script.includes('PEXPIRE')) {
      this.evalKinds.push('extend');
      return this.extend(keys, argv);
    }
    throw new Error(`FakeRedis가 모르는 스크립트: ${script}`);
  }

  /** 테스트에서 저장된 값을 그대로 들여다본다(커맨드가 아니므로 down의 영향을 받지 않는다). */
  peek(key: string): string | undefined {
    this.sweep();
    return this.values.get(key);
  }

  /** 락 TTL이 만료된 상황을 즉시 만든다(fake timer로 8초를 흘리지 않고도 재현). */
  forceExpire(key: string): void {
    this.values.delete(key);
    this.expiresAt.delete(key);
  }

  /** ACQUIRE_SCRIPT: SET NX 성공 시에만 fence를 INCR해서 반환한다. */
  private acquire(keys: string[], argv: string[]): number {
    const [lockKey, fenceKey] = keys;
    const [token, lockTtlMs, fenceTtlMs] = argv;
    if (this.values.has(lockKey)) {
      return 0;
    }
    this.values.set(lockKey, token);
    this.expiresAt.set(lockKey, Date.now() + Number(lockTtlMs));

    const fence = Number(this.values.get(fenceKey) ?? '0') + 1;
    this.values.set(fenceKey, String(fence));
    this.expiresAt.set(fenceKey, Date.now() + Number(fenceTtlMs));
    return fence;
  }

  /** EXTEND_SCRIPT: 내 token일 때만 TTL을 다시 민다. */
  private extend(keys: string[], argv: string[]): number {
    const [lockKey] = keys;
    const [token, ttlMs] = argv;
    if (this.values.get(lockKey) !== token) {
      return 0;
    }
    this.expiresAt.set(lockKey, Date.now() + Number(ttlMs));
    return 1;
  }

  /** RELEASE_SCRIPT: 내 token일 때만 지운다. */
  private release(keys: string[], argv: string[]): number {
    const [lockKey] = keys;
    const [token] = argv;
    if (this.values.get(lockKey) !== token) {
      return 0;
    }
    this.values.delete(lockKey);
    this.expiresAt.delete(lockKey);
    return 1;
  }

  /** FENCED_SET_SCRIPT: 더 새로운 fence가 이미 발급됐으면 쓰지 않는다. */
  private fencedSet(keys: string[], argv: string[]): number {
    const [fenceKey, targetKey] = keys;
    const [token, serialized, ttlSeconds] = argv;
    const latest = this.values.get(fenceKey);
    if (latest !== undefined && Number(latest) > Number(token)) {
      return 0;
    }
    this.values.set(targetKey, serialized);
    this.expiresAt.set(targetKey, Date.now() + Number(ttlSeconds) * 1000);
    return 1;
  }

  /** ioredis가 종료 시 호출하는 API. CacheService.onApplicationShutdown 호환용. */
  async quit(): Promise<'OK'> {
    return 'OK';
  }

  disconnect(): void {
    // no-op
  }

  /** FENCED_DEL_SCRIPT: 더 새로운 fence가 이미 발급됐으면 지우지 않는다. */
  private fencedDel(keys: string[], argv: string[]): number {
    const [fenceKey, targetKey] = keys;
    const [token] = argv;
    const latest = this.values.get(fenceKey);
    if (latest !== undefined && Number(latest) > Number(token)) {
      return 0;
    }
    this.values.delete(targetKey);
    this.expiresAt.delete(targetKey);
    return 1;
  }

  private assertUp(): void {
    if (this.down) {
      throw new Error('Connection is closed.');
    }
  }

  private assertDataCommandsUp(): void {
    this.assertUp();
    if (this.dataCommandsDown) {
      throw new Error('Connection is closed.');
    }
  }

  private sweep(): void {
    const now = Date.now();
    for (const [key, expiry] of this.expiresAt) {
      if (expiry <= now) {
        this.values.delete(key);
        this.expiresAt.delete(key);
      }
    }
  }
}
