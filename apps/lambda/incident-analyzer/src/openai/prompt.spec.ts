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
});
