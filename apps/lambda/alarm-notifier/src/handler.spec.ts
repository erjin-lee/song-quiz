import fixture from "../test/fixtures/alarm-state-change.json";
import { EventBridgeAlarmStateChangeEvent } from "./types";

const mockSendSlackMessage = jest.fn();
const mockGetSlackWebhookUrl = jest.fn();

jest.mock("./send-slack-message", () => ({
  sendSlackMessage: (...args: unknown[]) => mockSendSlackMessage(...args),
}));
jest.mock("./get-slack-webhook-url", () => ({
  getSlackWebhookUrl: (...args: unknown[]) => mockGetSlackWebhookUrl(...args),
}));

const alarmEvent = fixture as unknown as EventBridgeAlarmStateChangeEvent;

describe("handler", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      ALARM_NAME_PREFIX: "SongQuiz-Prod-",
      SLACK_WEBHOOK_PARAMETER_NAME: "/song-quiz/prod/slack/alarm-webhook-url",
    };
    mockGetSlackWebhookUrl.mockResolvedValue(
      "https://hooks.slack.com/services/test",
    );
    mockSendSlackMessage.mockResolvedValue(undefined);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("ALARM 이벤트는 Slack 메시지를 만들어 보낸다", async () => {
    const { handler } = await import("./handler");

    await handler(alarmEvent);

    expect(mockSendSlackMessage).toHaveBeenCalledTimes(1);
    const [, message] = mockSendSlackMessage.mock.calls[0];
    expect(message.text).toBe("🚨 [HIGH] Game Alarm");
  });

  it("OK 이벤트는 RECOVERED 메시지를 만들어 보낸다", async () => {
    const okEvent: EventBridgeAlarmStateChangeEvent = {
      ...alarmEvent,
      detail: {
        ...alarmEvent.detail,
        state: { ...alarmEvent.detail.previousState, value: "OK" },
        previousState: { ...alarmEvent.detail.state, value: "ALARM" },
      },
    };

    const { handler } = await import("./handler");
    await handler(okEvent);

    expect(mockSendSlackMessage).toHaveBeenCalledTimes(1);
    const [, message] = mockSendSlackMessage.mock.calls[0];
    expect(message.text).toBe("✅ [RECOVERED] Game Alarm");
  });

  it("INSUFFICIENT_DATA 상태는 무시하고 Slack을 호출하지 않는다", async () => {
    const event: EventBridgeAlarmStateChangeEvent = {
      ...alarmEvent,
      detail: {
        ...alarmEvent.detail,
        state: { ...alarmEvent.detail.state, value: "INSUFFICIENT_DATA" },
      },
    };

    const { handler } = await import("./handler");
    await handler(event);

    expect(mockGetSlackWebhookUrl).not.toHaveBeenCalled();
    expect(mockSendSlackMessage).not.toHaveBeenCalled();
  });

  it("다른 프로젝트(prefix가 다른) Alarm은 무시한다", async () => {
    const event: EventBridgeAlarmStateChangeEvent = {
      ...alarmEvent,
      detail: {
        ...alarmEvent.detail,
        alarmName: "OtherProject-Prod-High-Game-Target5xx",
      },
    };

    const { handler } = await import("./handler");
    await handler(event);

    expect(mockSendSlackMessage).not.toHaveBeenCalled();
  });

  it("naming convention이 깨진 alarm도 graceful fallback으로 메시지를 보낸다", async () => {
    const event: EventBridgeAlarmStateChangeEvent = {
      ...alarmEvent,
      detail: { ...alarmEvent.detail, alarmName: "SongQuiz-Prod-broken" },
    };

    const { handler } = await import("./handler");
    await handler(event);

    expect(mockSendSlackMessage).toHaveBeenCalledTimes(1);
    const [, message] = mockSendSlackMessage.mock.calls[0];
    expect(message.text).toContain("UNKNOWN");
  });
});
