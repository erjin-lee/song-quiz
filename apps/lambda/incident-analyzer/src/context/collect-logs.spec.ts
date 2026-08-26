const sendMock = jest.fn();

jest.mock("@aws-sdk/client-cloudwatch-logs", () => {
  const actual = jest.requireActual("@aws-sdk/client-cloudwatch-logs");
  return {
    ...actual,
    CloudWatchLogsClient: jest
      .fn()
      .mockImplementation(() => ({ send: sendMock })),
  };
});

import { collectLogs } from "./collect-logs";

const CONFIG = {
  gameLogGroupName: "/deploy-terraform/game",
  apiLogGroupName: "/deploy-terraform/api",
};
const WINDOW = {
  startTime: new Date("2026-08-24T02:15:00.000Z"),
  endTime: new Date("2026-08-24T02:30:00.000Z"),
};

function field(field: string, value: string) {
  return { field, value };
}

describe("collectLogs", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    sendMock.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function runCollectLogs(
    incidentType:
      | "QUIZ_SNAPSHOT_FAILURE"
      | "GAME_TARGET_5XX"
      | "API_TARGET_5XX" = "QUIZ_SNAPSHOT_FAILURE",
  ) {
    const promise = collectLogs(WINDOW, CONFIG, incidentType);
    // StartQuery(1회) 이후 poll을 1번만 하도록 GetQueryResults가 즉시 Complete를 준다.
    await jest.advanceTimersByTimeAsync(1000);
    return promise;
  }

  it("event/errorCode별 count와 총 errorCount를 집계한다", async () => {
    sendMock.mockResolvedValueOnce({ queryId: "q-1" });
    sendMock.mockResolvedValueOnce({
      status: "Complete",
      results: [
        [
          field("@timestamp", "2026-08-24 02:29:59.000"),
          field("@message", '{"event":"quiz_snapshot_failed"}'),
          field("event", "quiz_snapshot_failed"),
          field("errorCode", "QUIZ_ROUNDS_FETCH_FAILED"),
        ],
        [
          field("@timestamp", "2026-08-24 02:20:00.000"),
          field("@message", '{"level":"error"}'),
          field("level", "error"),
          field("errorCode", "INTERNAL_API_TIMEOUT"),
        ],
      ],
    });

    const result = await runCollectLogs();

    expect(result.status).toBe("success");
    expect(result.logs.errorCount).toBe(2);
    expect(result.logs.eventCounts).toEqual([
      { event: "quiz_snapshot_failed", count: 1 },
    ]);
    expect(result.logs.errorCodeCounts).toEqual(
      expect.arrayContaining([
        { errorCode: "QUIZ_ROUNDS_FETCH_FAILED", count: 1 },
        { errorCode: "INTERNAL_API_TIMEOUT", count: 1 },
      ]),
    );
  });

  it("같은 event/errorCode 조합이 반복되면 대표 샘플 1건만 남긴다", async () => {
    sendMock.mockResolvedValueOnce({ queryId: "q-1" });
    sendMock.mockResolvedValueOnce({
      status: "Complete",
      results: Array.from({ length: 5 }, (_, i) => [
        field("@timestamp", `2026-08-24 02:2${i}:00.000`),
        field("@message", "dup"),
        field("event", "quiz_snapshot_failed"),
        field("errorCode", "QUIZ_ROUNDS_FETCH_FAILED"),
      ]),
    });

    const result = await runCollectLogs();

    expect(result.logs.errorCount).toBe(5);
    expect(result.logs.samples).toHaveLength(1);
  });

  it("message에 포함된 roomId/quizId를 redact하고, allowlist 밖 필드는 담지 않는다", async () => {
    sendMock.mockResolvedValueOnce({ queryId: "q-1" });
    sendMock.mockResolvedValueOnce({
      status: "Complete",
      results: [
        [
          field("@timestamp", "2026-08-24 02:29:59.000"),
          field(
            "@message",
            "퀴즈 라운드 스냅샷 조회 실패(roomId: 11111111-2222-3333-4444-555555555555, quizId: 42): timeout",
          ),
          field("event", "quiz_snapshot_failed"),
          field("errorCode", "QUIZ_ROUNDS_FETCH_FAILED"),
          field("roomId", "11111111-2222-3333-4444-555555555555"),
          field("userId", "should-not-appear"),
          field("traceId", "a".repeat(32)),
        ],
      ],
    });

    const result = await runCollectLogs();

    const [sample] = result.logs.samples;
    expect(sample.message).not.toContain(
      "11111111-2222-3333-4444-555555555555",
    );
    expect(sample.message).toContain("roomId: [REDACTED]");
    expect(sample.message).toContain("quizId: [REDACTED]");
    expect(sample).not.toHaveProperty("roomId");
    expect(sample).not.toHaveProperty("userId");
    expect(sample.traceId).toBe("a".repeat(32));
  });

  it("쿼리가 Failed 상태로 끝나면 failed 상태와 빈 요약을 반환한다", async () => {
    sendMock.mockResolvedValueOnce({ queryId: "q-1" });
    sendMock.mockResolvedValueOnce({ status: "Failed", results: [] });

    const result = await runCollectLogs();

    expect(result.status).toBe("failed");
    expect(result.logs.errorCount).toBe(0);
    expect(result.logs.samples).toEqual([]);
  });

  describe("API_TARGET_5XX(신규 - apps/api Log Group 조회)", () => {
    it("game이 아니라 apiLogGroupName으로 StartQuery를 호출한다", async () => {
      sendMock.mockResolvedValueOnce({ queryId: "q-1" });
      sendMock.mockResolvedValueOnce({ status: "Complete", results: [] });

      await runCollectLogs("API_TARGET_5XX");

      const startQueryInput = sendMock.mock.calls[0][0].input;
      expect(startQueryInput.logGroupNames).toEqual([CONFIG.apiLogGroupName]);
      expect(startQueryInput.queryString).toContain("method, path, statusCode");
      expect(startQueryInput.queryString).not.toContain("quiz_snapshot_failed");
    });

    it("method/path/statusCode를 samples에 담는다", async () => {
      sendMock.mockResolvedValueOnce({ queryId: "q-1" });
      sendMock.mockResolvedValueOnce({
        status: "Complete",
        results: [
          [
            field("@timestamp", "2026-08-24 02:29:59.000"),
            field("@message", '{"level":"error"}'),
            field("level", "error"),
            field("method", "GET"),
            field("path", "/internal/quizzes/42/snapshot"),
            field("statusCode", "502"),
          ],
        ],
      });

      const result = await runCollectLogs("API_TARGET_5XX");

      const [sample] = result.logs.samples;
      expect(sample.method).toBe("GET");
      expect(sample.path).toBe("/internal/quizzes/42/snapshot");
      expect(sample.statusCode).toBe(502);
    });

    it("event/errorCode가 없는 access log 행들은 path/statusCode가 다르면 서로 다른 샘플로 남는다", async () => {
      sendMock.mockResolvedValueOnce({ queryId: "q-1" });
      sendMock.mockResolvedValueOnce({
        status: "Complete",
        results: [
          [
            field("@timestamp", "2026-08-24 02:29:59.000"),
            field("@message", "a"),
            field("level", "error"),
            field("method", "GET"),
            field("path", "/quizzes"),
            field("statusCode", "500"),
          ],
          [
            field("@timestamp", "2026-08-24 02:29:00.000"),
            field("@message", "b"),
            field("level", "error"),
            field("method", "POST"),
            field("path", "/inquiries"),
            field("statusCode", "503"),
          ],
        ],
      });

      const result = await runCollectLogs("API_TARGET_5XX");

      expect(result.logs.samples).toHaveLength(2);
    });

    it("apiLogGroupName이 없으면 AWS를 호출하지 않고 failed를 반환한다", async () => {
      const result = await collectLogs(
        WINDOW,
        { gameLogGroupName: CONFIG.gameLogGroupName },
        "API_TARGET_5XX",
      );

      expect(sendMock).not.toHaveBeenCalled();
      expect(result.status).toBe("failed");
      expect(result.logs.samples).toEqual([]);
    });
  });
});
