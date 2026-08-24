const sendMock = jest.fn();

jest.mock("@aws-sdk/client-xray", () => ({
  XRayClient: jest.fn().mockImplementation(() => ({ send: sendMock })),
  BatchGetTracesCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

import { collectTraces, otelTraceIdToXrayTraceId } from "./collect-traces";

describe("otelTraceIdToXrayTraceId", () => {
  it("32자리 hex OTel trace id를 X-Ray 형식(1-xxxxxxxx-yyyy...)으로 변환한다", () => {
    const otelTraceId = "5f84c7c1e2a1b2c3d4e5f6a7b8c9d0e1";
    expect(otelTraceIdToXrayTraceId(otelTraceId)).toBe(
      "1-5f84c7c1-e2a1b2c3d4e5f6a7b8c9d0e1",
    );
  });

  it("형식이 다르면 null을 반환한다", () => {
    expect(otelTraceIdToXrayTraceId("not-a-trace-id")).toBeNull();
  });
});

describe("collectTraces", () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  it("traceId가 없으면 X-Ray를 호출하지 않고 빈 배열을 반환한다", async () => {
    const result = await collectTraces([]);

    expect(result).toEqual({ status: "success", traces: [] });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("game -> undici -> api -> mysql2 구간을 평탄화하고 가장 느린 span을 계산한다", async () => {
    const gameDoc = {
      name: "game",
      origin: "game",
      start_time: 1000.0,
      end_time: 1002.5,
      subsegments: [
        { name: "GET api.internal", start_time: 1000.1, end_time: 1002.4 },
      ],
    };
    const apiDoc = {
      name: "api",
      origin: "api",
      start_time: 1000.2,
      end_time: 1002.3,
      subsegments: [
        {
          name: "mysql SELECT",
          start_time: 1000.3,
          end_time: 1002.18,
          error: true,
        },
      ],
    };

    sendMock.mockResolvedValueOnce({
      Traces: [
        {
          Id: "1-5f84c7c1-e2a1b2c3d4e5f6a7b8c9d0e1",
          Segments: [
            { Document: JSON.stringify(gameDoc) },
            { Document: JSON.stringify(apiDoc) },
          ],
        },
      ],
    });

    const result = await collectTraces(["5f84c7c1e2a1b2c3d4e5f6a7b8c9d0e1"]);

    expect(result.status).toBe("success");
    const [trace] = result.traces;
    expect(trace.hasError).toBe(true);
    expect(trace.spans).toHaveLength(4);
    expect(trace.slowestSpans[0]).toEqual({
      service: "game",
      name: "game",
      durationMs: 2500,
    });
    expect(trace.slowestSpans.find((s) => s.name === "mysql SELECT")).toEqual({
      service: "api",
      name: "mysql SELECT",
      durationMs: 1880,
    });
  });

  it("BatchGetTraces 호출이 실패하면 failed 상태를 반환한다", async () => {
    sendMock.mockRejectedValueOnce(new Error("boom"));

    const result = await collectTraces(["5f84c7c1e2a1b2c3d4e5f6a7b8c9d0e1"]);

    expect(result).toEqual({ status: "failed", traces: [] });
  });
});
