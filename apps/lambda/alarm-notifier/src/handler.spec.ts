import fixture from "../test/fixtures/alarm-state-change.json";
import { EventBridgeAlarmStateChangeEvent } from "./types";

const mockSendSlackMessage = jest.fn();
const mockGetSlackWebhookUrl = jest.fn();
const mockGetRecentSuccessCount = jest.fn();

jest.mock("./send-slack-message", () => ({
  sendSlackMessage: (...args: unknown[]) => mockSendSlackMessage(...args),
}));
jest.mock("./get-slack-webhook-url", () => ({
  getSlackWebhookUrl: (...args: unknown[]) => mockGetSlackWebhookUrl(...args),
}));
jest.mock("./get-recent-success-count", () => ({
  getRecentSuccessCount: (...args: unknown[]) =>
    mockGetRecentSuccessCount(...args),
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
      GAME_METRIC_NAMESPACE: "SongQuiz/Game",
      RECOVERY_CONFIRM_ALARM_SIGNAL: "QuizSnapshotFailure",
      RECOVERY_CONFIRM_METRIC_NAME: "GameStartSuccess",
      RECOVERY_CONFIRM_MIN_COUNT: "5",
      RECOVERY_CONFIRM_LOOKBACK_MINUTES: "5",
    };
    mockGetSlackWebhookUrl.mockResolvedValue(
      "https://hooks.slack.com/services/test",
    );
    mockSendSlackMessage.mockResolvedValue(undefined);
    // 대부분의 테스트는 QuizSnapshotFailure가 아니거나 GAME_METRIC_NAMESPACE가 없어 이 값 자체가
    // 안 쓰이지만, 쓰이는 경우 기본값은 "충분히 복구됨"으로 둔다.
    mockGetRecentSuccessCount.mockResolvedValue(999);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("ALARM 이벤트는 Slack 메시지를 만들어 보낸다", async () => {
    const { handler } = await import("./handler");

    await handler(alarmEvent);

    expect(mockSendSlackMessage).toHaveBeenCalledTimes(1);
    const [, message] = mockSendSlackMessage.mock.calls[0];
    expect(message.text).toBe("🚨 [HIGH] Game 알람 발생");
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
    expect(message.text).toBe("✅ [복구됨] Game 알람");
  });

  // 아래 두 케이스는 "새 상태가 INSUFFICIENT_DATA"인 케이스와 다르다. Alarm을 새로 만들면
  // INSUFFICIENT_DATA -> OK 전이가 발생하는데(treat_missing_data = notBreaching), 이걸 막지
  // 않으면 장애가 난 적도 없는데 "복구됨" 알림이 Slack에 올라간다.
  it("INSUFFICIENT_DATA -> OK 전이(신규 Alarm 생성 직후)는 복구 알림을 보내지 않는다", async () => {
    const newAlarmEvent: EventBridgeAlarmStateChangeEvent = {
      ...alarmEvent,
      detail: {
        ...alarmEvent.detail,
        state: { ...alarmEvent.detail.state, value: "OK" },
        previousState: {
          ...alarmEvent.detail.previousState,
          value: "INSUFFICIENT_DATA",
        },
      },
    };

    const { handler } = await import("./handler");
    await handler(newAlarmEvent);

    expect(mockGetSlackWebhookUrl).not.toHaveBeenCalled();
    expect(mockSendSlackMessage).not.toHaveBeenCalled();
  });

  it("previousState가 없는 이벤트의 OK도 복구 알림을 보내지 않는다", async () => {
    const eventWithoutPreviousState = {
      ...alarmEvent,
      detail: {
        ...alarmEvent.detail,
        state: { ...alarmEvent.detail.state, value: "OK" },
        previousState: undefined,
      },
    } as unknown as EventBridgeAlarmStateChangeEvent;

    const { handler } = await import("./handler");
    await handler(eventWithoutPreviousState);

    expect(mockSendSlackMessage).not.toHaveBeenCalled();
  });

  it("INSUFFICIENT_DATA -> ALARM 전이는 정상적으로 알람을 보낸다", async () => {
    const event: EventBridgeAlarmStateChangeEvent = {
      ...alarmEvent,
      detail: {
        ...alarmEvent.detail,
        state: { ...alarmEvent.detail.state, value: "ALARM" },
        previousState: {
          ...alarmEvent.detail.previousState,
          value: "INSUFFICIENT_DATA",
        },
      },
    };

    const { handler } = await import("./handler");
    await handler(event);

    expect(mockSendSlackMessage).toHaveBeenCalledTimes(1);
    const [, message] = mockSendSlackMessage.mock.calls[0];
    expect(message.text).toBe("🚨 [HIGH] Game 알람 발생");
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

  describe("QuizSnapshotFailure 복구 확인", () => {
    const quizSnapshotFailureOkEvent: EventBridgeAlarmStateChangeEvent = {
      ...alarmEvent,
      detail: {
        ...alarmEvent.detail,
        alarmName: "SongQuiz-Prod-High-Game-QuizSnapshotFailure",
        state: { ...alarmEvent.detail.previousState, value: "OK" },
        previousState: { ...alarmEvent.detail.state, value: "ALARM" },
      },
    };

    it("최근 게임 시작 성공이 기준(5회) 이상이면 RECOVERED를 보내고 성공 횟수를 표시한다", async () => {
      mockGetRecentSuccessCount.mockResolvedValue(7);

      const { handler } = await import("./handler");
      await handler(quizSnapshotFailureOkEvent);

      expect(mockGetRecentSuccessCount).toHaveBeenCalledWith(
        "SongQuiz/Game",
        "GameStartSuccess",
        5,
      );
      expect(mockSendSlackMessage).toHaveBeenCalledTimes(1);
      const [, message] = mockSendSlackMessage.mock.calls[0];
      expect(
        message.blocks.some((block: { fields?: { text: string }[] }) =>
          block.fields?.some((field) =>
            field.text.includes("*최근 게임 시작 성공*\n7회"),
          ),
        ),
      ).toBe(true);
    });

    it("최근 게임 시작 성공이 기준(5회) 미만이면 RECOVERED를 보내지 않는다", async () => {
      mockGetRecentSuccessCount.mockResolvedValue(4);

      const { handler } = await import("./handler");
      await handler(quizSnapshotFailureOkEvent);

      expect(mockSendSlackMessage).not.toHaveBeenCalled();
    });

    it("성공 횟수 조회가 실패하면(fail open) 그래도 RECOVERED를 보내되 확인 안 된 성공 횟수는 표시하지 않는다", async () => {
      mockGetRecentSuccessCount.mockRejectedValue(new Error("boom"));

      const { handler } = await import("./handler");
      await handler(quizSnapshotFailureOkEvent);

      expect(mockSendSlackMessage).toHaveBeenCalledTimes(1);
      const [, message] = mockSendSlackMessage.mock.calls[0];
      expect(
        message.blocks.some((block: { fields?: { text: string }[] }) =>
          block.fields?.some((field) =>
            field.text.includes("*최근 게임 시작 성공*"),
          ),
        ),
      ).toBe(false);
    });

    it("QuizSnapshotFailure의 ALARM 전이는 복구 확인을 하지 않는다", async () => {
      const event: EventBridgeAlarmStateChangeEvent = {
        ...alarmEvent,
        detail: {
          ...alarmEvent.detail,
          alarmName: "SongQuiz-Prod-High-Game-QuizSnapshotFailure",
        },
      };

      const { handler } = await import("./handler");
      await handler(event);

      expect(mockGetRecentSuccessCount).not.toHaveBeenCalled();
      expect(mockSendSlackMessage).toHaveBeenCalledTimes(1);
    });

    it("GAME_METRIC_NAMESPACE가 없으면 복구 확인 없이 바로 RECOVERED를 보낸다", async () => {
      delete process.env.GAME_METRIC_NAMESPACE;

      const { handler } = await import("./handler");
      await handler(quizSnapshotFailureOkEvent);

      expect(mockGetRecentSuccessCount).not.toHaveBeenCalled();
      expect(mockSendSlackMessage).toHaveBeenCalledTimes(1);
    });
  });
});
