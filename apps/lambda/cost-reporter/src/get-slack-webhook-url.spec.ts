export {};

const sendMock = jest.fn();

jest.mock("@aws-sdk/client-ssm", () => ({
  SSMClient: jest.fn().mockImplementation(() => ({ send: sendMock })),
  GetParameterCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

describe("getSlackWebhookUrl", () => {
  beforeEach(() => {
    sendMock.mockReset();
    jest.resetModules();
  });

  it("첫 호출은 SSM에서 값을 가져오고, 다음(warm) 호출은 캐시를 재사용해 SSM을 다시 부르지 않는다", async () => {
    sendMock.mockResolvedValueOnce({
      Parameter: { Value: "https://hooks.slack.com/services/test" },
    });

    const { getSlackWebhookUrl } = await import("./get-slack-webhook-url");

    const firstCallUrl = await getSlackWebhookUrl(
      "/song-quiz/prod/slack/alarm-webhook-url",
    );
    const secondCallUrl = await getSlackWebhookUrl(
      "/song-quiz/prod/slack/alarm-webhook-url",
    );

    expect(firstCallUrl).toBe("https://hooks.slack.com/services/test");
    expect(secondCallUrl).toBe("https://hooks.slack.com/services/test");
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("SSM 값이 비어있으면 에러를 던진다", async () => {
    sendMock.mockResolvedValueOnce({ Parameter: {} });

    const { getSlackWebhookUrl } = await import("./get-slack-webhook-url");

    await expect(
      getSlackWebhookUrl("/song-quiz/prod/slack/alarm-webhook-url"),
    ).rejects.toThrow("has no value");
  });
});
