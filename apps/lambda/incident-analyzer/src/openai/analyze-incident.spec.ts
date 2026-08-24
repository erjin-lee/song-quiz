const createMock = jest.fn();

jest.mock("openai", () =>
  jest.fn().mockImplementation(() => ({
    responses: { create: createMock },
  })),
);

import { analyzeIncident } from "./analyze-incident";
import { IncidentContext } from "../context/types";

const CONTEXT: IncidentContext = {
  alarm: {
    name: "SongQuiz-Prod-High-Game-QuizSnapshotFailure",
    service: "Game",
    severity: "High",
    signal: "QuizSnapshotFailure",
    state: "ALARM",
    triggeredAt: "2026-08-24T02:30:00.000Z",
  },
  metrics: [],
  logs: { errorCount: 0, eventCounts: [], errorCodeCounts: [], samples: [] },
  traces: [],
  collection: { metrics: "success", logs: "success", traces: "success" },
};

const VALID_RESULT = {
  summary: "요약",
  probableCause: "DB 지연 가능성",
  confidence: "HIGH",
  evidence: ["근거1"],
  recommendedChecks: ["확인1"],
  limitations: [],
};

describe("analyzeIncident", () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  it("system/user 메시지와 json_schema structured output 요청을 보낸다", async () => {
    createMock.mockResolvedValueOnce({
      output_text: JSON.stringify(VALID_RESULT),
    });

    await analyzeIncident(CONTEXT, {
      apiKey: "sk-test",
      model: "gpt-5.6-luna",
    });

    expect(createMock).toHaveBeenCalledTimes(1);
    const request = createMock.mock.calls[0][0];
    expect(request.model).toBe("gpt-5.6-luna");
    expect(request.input).toHaveLength(2);
    expect(request.input[0].role).toBe("system");
    expect(request.input[1].role).toBe("user");
    expect(request.input[1].content).toContain("QuizSnapshotFailure");
    expect(request.text.format.type).toBe("json_schema");
    expect(request.text.format.strict).toBe(true);
  });

  it("정상 응답은 그대로 파싱해서 반환한다", async () => {
    createMock.mockResolvedValueOnce({
      output_text: JSON.stringify(VALID_RESULT),
    });

    const result = await analyzeIncident(CONTEXT, {
      apiKey: "sk-test",
      model: "m",
    });

    expect(result).toEqual(VALID_RESULT);
  });

  it("content가 없으면 LOW confidence fallback을 반환한다", async () => {
    createMock.mockResolvedValueOnce({ output_text: "" });

    const result = await analyzeIncident(CONTEXT, {
      apiKey: "sk-test",
      model: "m",
    });

    expect(result.confidence).toBe("LOW");
    expect(result.limitations.length).toBeGreaterThan(0);
  });

  it("JSON 파싱에 실패하면 throw하지 않고 fallback을 반환한다(§21)", async () => {
    createMock.mockResolvedValueOnce({ output_text: "not json" });

    const result = await analyzeIncident(CONTEXT, {
      apiKey: "sk-test",
      model: "m",
    });

    expect(result.confidence).toBe("LOW");
  });

  it("스키마를 벗어난 응답(confidence 값이 이상함)은 fallback을 반환한다", async () => {
    createMock.mockResolvedValueOnce({
      output_text: JSON.stringify({ ...VALID_RESULT, confidence: "CERTAIN" }),
    });

    const result = await analyzeIncident(CONTEXT, {
      apiKey: "sk-test",
      model: "m",
    });

    expect(result.confidence).toBe("LOW");
  });

  it("OpenAI API 호출 자체가 실패하면 그대로 throw한다(호출부가 stage=openai로 처리)", async () => {
    createMock.mockRejectedValueOnce(new Error("network error"));

    await expect(
      analyzeIncident(CONTEXT, { apiKey: "sk-test", model: "m" }),
    ).rejects.toThrow("network error");
  });
});
