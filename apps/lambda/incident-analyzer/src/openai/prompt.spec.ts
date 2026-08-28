import { SYSTEM_PROMPT } from "./prompt";

// 실제 모델의 판단 품질(§27 "테스트 Alarm + 최근 PR" 시나리오)은 unit test로 검증할 수
// 없다 - 대신 System Prompt에 "최근 배포 ≠ 장애 원인"이라는 가드레일 문구가 실제로
// 포함되어 있는지를 검증한다(§22~23, §32에서 요구하는 규칙이 실제로 프롬프트에 있는지).
describe("SYSTEM_PROMPT", () => {
  it("최근 배포/PR을 보조 근거로만 쓰라는 규칙을 포함한다", () => {
    expect(SYSTEM_PROMPT).toContain("보조 근거");
    expect(SYSTEM_PROMPT).toContain("단정하지 않는다");
  });

  it("Alarm 이후에 배포된 경우 원인 후보에서 제외하라는 규칙을 포함한다", () => {
    expect(SYSTEM_PROMPT).toContain("minutesBeforeIncident가 음수면");
  });

  it("테스트/수동 Alarm을 실제 코드 장애로 해석하지 말라는 규칙을 포함한다", () => {
    expect(SYSTEM_PROMPT).toContain("set-alarm-state");
  });

  it("evidence/recommendedChecks/limitations 개수 제한 안내를 포함한다", () => {
    expect(SYSTEM_PROMPT).toContain("최대 6개");
  });

  it("Game Target5xx 분석 목표(비교해야 할 가능성 후보)를 포함한다", () => {
    expect(SYSTEM_PROMPT).toContain("Redis/lock 문제");
    expect(SYSTEM_PROMPT).toContain("Timer/claim 문제");
    expect(SYSTEM_PROMPT).toContain("EC2 resource pressure");
    expect(SYSTEM_PROMPT).toContain("원인을 특정할 수 없음");
  });

  it("RedisLockFailure만으로 Redis 장애를 단정하지 말라는 규칙을 포함한다", () => {
    expect(SYSTEM_PROMPT).toContain("Redis 장애를 확정하지 않는다");
  });

  it("room 분산 락 metric 3종의 의미를 과대해석하지 말라는 규칙을 포함한다", () => {
    expect(SYSTEM_PROMPT).toContain("갱신 1회 실패일 뿐이다");
    expect(SYSTEM_PROMPT).toContain("같은 락을 획득했다는 사실까지 증명하지는 않는다");
    expect(SYSTEM_PROMPT).toContain("방어 로직이 정상 작동해");
  });

  it("Game lock metric은 API Target5xx에서 cross-service 보조 근거일 뿐이라는 규칙을 포함한다", () => {
    expect(SYSTEM_PROMPT).toContain("cross-service 보조 근거로만 쓴다");
  });

  it("API Target5xx 분석 목표(비교해야 할 가능성 후보)를 포함한다", () => {
    expect(SYSTEM_PROMPT).toContain("API application code path");
    expect(SYSTEM_PROMPT).toContain("DB(RDS)/mysql2 쿼리 또는 DB 의존성 문제");
    expect(SYSTEM_PROMPT).toContain("Game에서 시작된 요청이 API로 파급된 영향");
  });

  it("API 로그의 path가 정규화된 route 패턴이 아니라는 주의사항을 포함한다", () => {
    expect(SYSTEM_PROMPT).toContain("정규화된 route 패턴이 아니다");
  });

  it("RDS CPU 정상만으로 DB 문제를 배제하지 말라는 규칙을 포함한다", () => {
    expect(SYSTEM_PROMPT).toContain("완전히 배제하지 않는다");
  });

  it("Trace 부재만으로 네트워크 문제를 단정하지 말라는 규칙을 포함한다", () => {
    expect(SYSTEM_PROMPT).toContain("네트워크 문제라고 단정하지 않는다");
  });
});
