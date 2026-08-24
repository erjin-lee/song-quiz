import { formatKst } from "./format-time";

describe("formatKst", () => {
  it("UTC ISO timestamp를 KST(UTC+9)로 변환한다", () => {
    // UTC 2026-08-24 02:30:12 -> KST 2026-08-24 11:30:12
    expect(formatKst("2026-08-24T02:30:12.000Z")).toBe(
      "2026-08-24 11:30:12 KST",
    );
  });

  it("날짜가 바뀌는 경우도 KST 기준으로 올바르게 표시한다", () => {
    // UTC 2026-08-23 16:00:00 -> KST 2026-08-24 01:00:00
    expect(formatKst("2026-08-23T16:00:00.000Z")).toBe(
      "2026-08-24 01:00:00 KST",
    );
  });
});
