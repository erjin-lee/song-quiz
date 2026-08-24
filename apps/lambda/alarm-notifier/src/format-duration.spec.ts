import { formatDuration } from "./format-duration";

describe("formatDuration", () => {
  it("초 단위 지속 시간을 표시한다", () => {
    expect(
      formatDuration("2026-08-24T02:30:00.000Z", "2026-08-24T02:30:45.000Z"),
    ).toBe("45초");
  });

  it("분/초를 함께 표시한다", () => {
    expect(
      formatDuration("2026-08-24T02:30:00.000Z", "2026-08-24T02:37:12.000Z"),
    ).toBe("7분 12초");
  });

  it("시간 단위에서는 초를 생략한다", () => {
    expect(
      formatDuration("2026-08-24T02:00:00.000Z", "2026-08-24T04:15:30.000Z"),
    ).toBe("2시간 15분");
  });

  it("종료 시각이 시작 시각보다 앞서면 알 수 없음을 반환한다", () => {
    expect(
      formatDuration("2026-08-24T02:30:00.000Z", "2026-08-24T02:00:00.000Z"),
    ).toBe("알 수 없음");
  });
});
