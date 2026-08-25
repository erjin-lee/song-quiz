const sendMock = jest.fn();

jest.mock("@aws-sdk/client-cloudwatch", () => ({
  CloudWatchClient: jest.fn().mockImplementation(() => ({ send: sendMock })),
  GetMetricDataCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

describe("getRecentSuccessCount", () => {
  beforeEach(() => {
    sendMock.mockReset();
    jest.resetModules();
  });

  it("MetricDataResults의 Values 합을 반환한다", async () => {
    sendMock.mockResolvedValueOnce({
      MetricDataResults: [{ Id: "recentSuccessCount", Values: [7] }],
    });

    const { getRecentSuccessCount } =
      await import("./get-recent-success-count");

    const count = await getRecentSuccessCount(
      "SongQuiz/Game",
      "GameStartSuccess",
      5,
      new Date("2026-08-25T00:10:00.000Z"),
    );

    expect(count).toBe(7);
  });

  it("데이터포인트가 없으면 0을 반환한다", async () => {
    sendMock.mockResolvedValueOnce({ MetricDataResults: [] });

    const { getRecentSuccessCount } =
      await import("./get-recent-success-count");

    const count = await getRecentSuccessCount(
      "SongQuiz/Game",
      "GameStartSuccess",
      5,
    );

    expect(count).toBe(0);
  });

  it("조회 구간(StartTime/EndTime)을 lookbackMinutes만큼 now 이전으로 계산한다", async () => {
    sendMock.mockResolvedValueOnce({ MetricDataResults: [] });

    const { getRecentSuccessCount } =
      await import("./get-recent-success-count");
    const { GetMetricDataCommand } = await import("@aws-sdk/client-cloudwatch");

    const now = new Date("2026-08-25T00:10:00.000Z");
    await getRecentSuccessCount("SongQuiz/Game", "GameStartSuccess", 5, now);

    expect(GetMetricDataCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        StartTime: new Date("2026-08-25T00:05:00.000Z"),
        EndTime: now,
      }),
    );
  });
});
