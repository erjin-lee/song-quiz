import { sendSlackMessage } from "./send-slack-message";

describe("sendSlackMessage", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("2xx 응답이면 정상적으로 완료된다", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      sendSlackMessage("https://hooks.slack.com/services/test", {
        text: "hi",
        blocks: [],
      }),
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://hooks.slack.com/services/test",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("2xx가 아니면 status를 포함한 에러를 던진다(webhook URL은 에러 메시지에 포함하지 않는다)", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 500 });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      sendSlackMessage("https://hooks.slack.com/services/test", {
        text: "hi",
        blocks: [],
      }),
    ).rejects.toThrow("status 500");
  });
});
