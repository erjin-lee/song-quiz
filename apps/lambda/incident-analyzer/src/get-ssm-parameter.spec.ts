const sendMock = jest.fn();

jest.mock("@aws-sdk/client-ssm", () => ({
  SSMClient: jest.fn().mockImplementation(() => ({ send: sendMock })),
  GetParameterCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

describe("getSsmParameter", () => {
  beforeEach(() => {
    sendMock.mockReset();
    jest.resetModules();
  });

  it("첫 호출은 SSM에서 값을 가져오고, 같은 이름의 다음 호출은 캐시를 재사용한다", async () => {
    sendMock.mockResolvedValueOnce({ Parameter: { Value: "sk-test" } });

    const { getSsmParameter } = await import("./get-ssm-parameter");

    const first = await getSsmParameter("/song-quiz/prod/openai/api-key");
    const second = await getSsmParameter("/song-quiz/prod/openai/api-key");

    expect(first).toBe("sk-test");
    expect(second).toBe("sk-test");
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("서로 다른 parameter 이름은 각각 SSM을 호출한다", async () => {
    sendMock.mockResolvedValueOnce({ Parameter: { Value: "webhook-url" } });
    sendMock.mockResolvedValueOnce({ Parameter: { Value: "sk-test" } });

    const { getSsmParameter } = await import("./get-ssm-parameter");

    const webhook = await getSsmParameter(
      "/song-quiz/prod/slack/alarm-webhook-url",
    );
    const apiKey = await getSsmParameter("/song-quiz/prod/openai/api-key");

    expect(webhook).toBe("webhook-url");
    expect(apiKey).toBe("sk-test");
    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  it("SSM 값이 비어있으면 에러를 던진다", async () => {
    sendMock.mockResolvedValueOnce({ Parameter: {} });

    const { getSsmParameter } = await import("./get-ssm-parameter");

    await expect(
      getSsmParameter("/song-quiz/prod/openai/api-key"),
    ).rejects.toThrow("has no value");
  });
});
