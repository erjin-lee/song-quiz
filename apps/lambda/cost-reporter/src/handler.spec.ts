export {};

const mockFetchDailyCosts = jest.fn();
const mockFetchServiceCosts = jest.fn();
const mockFetchForecastRemainderUsd = jest.fn();
const mockGetSlackWebhookUrl = jest.fn();
const mockSendSlackMessage = jest.fn();

jest.mock("./fetch-daily-costs", () => ({
  fetchDailyCosts: (...args: unknown[]) => mockFetchDailyCosts(...args),
}));
jest.mock("./fetch-service-costs", () => ({
  fetchServiceCosts: (...args: unknown[]) => mockFetchServiceCosts(...args),
}));
jest.mock("./fetch-forecast", () => ({
  fetchForecastRemainderUsd: (...args: unknown[]) =>
    mockFetchForecastRemainderUsd(...args),
}));
jest.mock("./get-slack-webhook-url", () => ({
  getSlackWebhookUrl: (...args: unknown[]) => mockGetSlackWebhookUrl(...args),
}));
jest.mock("./send-slack-message", () => ({
  sendSlackMessage: (...args: unknown[]) => mockSendSlackMessage(...args),
}));

describe("handler", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      SLACK_WEBHOOK_PARAMETER_NAME: "/song-quiz/prod/slack/alarm-webhook-url",
    };

    mockFetchDailyCosts.mockResolvedValue([
      {
        date: "2026-08-27",
        recordTypeAmounts: [
          { recordType: "Usage", amountUsd: 12.36 },
          { recordType: "Credit", amountUsd: -10.22 },
        ],
      },
    ]);
    mockFetchServiceCosts.mockResolvedValue([
      { service: "Amazon EC2", amountUsd: 0.82 },
    ]);
    mockFetchForecastRemainderUsd.mockResolvedValue(16.48);
    mockGetSlackWebhookUrl.mockResolvedValue(
      "https://hooks.slack.com/services/test",
    );
    mockSendSlackMessage.mockResolvedValue(undefined);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("정상 흐름: Cost Explorer 결과를 모아 Slack에 한 번 전송한다(크레딧 포함)", async () => {
    const { handler } = await import("./handler");
    await handler();

    expect(mockSendSlackMessage).toHaveBeenCalledTimes(1);
    const [, message] = mockSendSlackMessage.mock.calls[0];
    expect(message.text).toBe("💰 SongQuiz AWS Cost");
    expect(JSON.stringify(message.blocks)).toContain("전일 적용 크레딧");
  });

  it("SLACK_WEBHOOK_PARAMETER_NAME이 없으면 AWS를 호출하지 않고 에러를 던진다", async () => {
    process.env.SLACK_WEBHOOK_PARAMETER_NAME = "";
    const { handler } = await import("./handler");

    await expect(handler()).rejects.toThrow("SLACK_WEBHOOK_PARAMETER_NAME");
    expect(mockFetchDailyCosts).not.toHaveBeenCalled();
  });

  it("전일/누적 비용 조회 실패 시 Slack을 보내지 않고 에러를 던진다", async () => {
    mockFetchDailyCosts.mockRejectedValue(new Error("CE unavailable"));
    const { handler } = await import("./handler");

    await expect(handler()).rejects.toThrow("CE unavailable");
    expect(mockSendSlackMessage).not.toHaveBeenCalled();
  });

  it("서비스별 내역 조회 실패는 fail-open으로 처리해 나머지 정보로 Slack을 그대로 보낸다", async () => {
    mockFetchServiceCosts.mockRejectedValue(new Error("group by failed"));
    const { handler } = await import("./handler");

    await handler();

    expect(mockSendSlackMessage).toHaveBeenCalledTimes(1);
    const [, message] = mockSendSlackMessage.mock.calls[0];
    expect(JSON.stringify(message.blocks)).not.toContain("주요 서비스");
  });

  it("예상 비용(forecast) 조회 실패는 fail-open으로 처리해 예측 불가로 표시하고 Slack을 그대로 보낸다", async () => {
    mockFetchForecastRemainderUsd.mockRejectedValue(
      new Error("forecast unavailable"),
    );
    const { handler } = await import("./handler");

    await handler();

    const [, message] = mockSendSlackMessage.mock.calls[0];
    expect(JSON.stringify(message.blocks)).toContain("예측 불가");
  });

  it("Slack 전송 실패 시 에러를 던진다", async () => {
    mockSendSlackMessage.mockRejectedValue(new Error("slack down"));
    const { handler } = await import("./handler");

    await expect(handler()).rejects.toThrow("slack down");
  });
});
