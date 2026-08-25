import { buildSlackMessage } from "./build-slack-message";
import { parseAlarmName } from "./parse-alarm-name";
import { CloudWatchAlarmStateChangeDetail } from "./types";

const PREFIX = "SongQuiz-Prod-";

interface SlackBlock {
  type: string;
  fields?: { type: string; text: string }[];
  text?: { type: string; text: string };
}

function blocksOf(message: ReturnType<typeof buildSlackMessage>): SlackBlock[] {
  return message.blocks as SlackBlock[];
}

function alarmSection(
  message: ReturnType<typeof buildSlackMessage>,
): SlackBlock {
  const block = blocksOf(message).find(
    (b) => b.type === "section" && b.fields !== undefined,
  );
  if (!block) throw new Error("section block with fields not found");
  return block;
}

function reasonSection(
  message: ReturnType<typeof buildSlackMessage>,
): SlackBlock {
  const block = blocksOf(message).find(
    (b) => b.type === "section" && b.text !== undefined,
  );
  if (!block) throw new Error("section block with text not found");
  return block;
}

describe("buildSlackMessage", () => {
  it("ALARM 상태에서 🚨 헤더와 OK → ALARM State를 표시한다", () => {
    const detail: CloudWatchAlarmStateChangeDetail = {
      alarmName: "SongQuiz-Prod-High-Game-Target5xx",
      state: {
        value: "ALARM",
        reason:
          "Threshold Crossed: 1 datapoint [6.0] was greater than or equal to the threshold (5.0).",
        timestamp: "2026-08-24T02:30:12.000Z",
      },
      previousState: {
        value: "OK",
        reason: "previously ok",
        timestamp: "2026-08-24T02:25:00.000Z",
      },
    };

    const message = buildSlackMessage(
      detail,
      parseAlarmName(detail.alarmName, PREFIX),
    );

    expect(message.text).toBe("🚨 [HIGH] Game 알람 발생");
    const fields = alarmSection(message).fields;
    expect(fields).toEqual([
      { type: "mrkdwn", text: "*알람*\nSongQuiz-Prod-High-Game-Target5xx" },
      { type: "mrkdwn", text: "*서비스*\nGame" },
      { type: "mrkdwn", text: "*시그널*\nTarget5xx" },
      { type: "mrkdwn", text: "*상태*\nOK → ALARM" },
    ]);
    expect(reasonSection(message).text?.text).toContain("Threshold Crossed");
  });

  it("OK 상태(ALARM에서 복구)에서 ✅ RECOVERED 헤더와 Duration을 표시한다", () => {
    const detail: CloudWatchAlarmStateChangeDetail = {
      alarmName: "SongQuiz-Prod-High-Game-Target5xx",
      state: {
        value: "OK",
        reason: "Threshold not crossed for 1 datapoint",
        timestamp: "2026-08-24T02:37:00.000Z",
      },
      previousState: {
        value: "ALARM",
        reason: "was in alarm",
        timestamp: "2026-08-24T02:30:00.000Z",
      },
    };

    const message = buildSlackMessage(
      detail,
      parseAlarmName(detail.alarmName, PREFIX),
    );

    expect(message.text).toBe("✅ [복구됨] Game 알람");
    const fields = alarmSection(message).fields;
    expect(fields).toContainEqual({
      type: "mrkdwn",
      text: "*상태*\nALARM → OK",
    });
    expect(fields).toContainEqual({
      type: "mrkdwn",
      text: "*장애 지속시간*\n7분",
    });
  });

  it("recoveryConfirmation이 있으면 최근 성공 횟수 필드를 추가한다", () => {
    const detail: CloudWatchAlarmStateChangeDetail = {
      alarmName: "SongQuiz-Prod-High-Game-QuizSnapshotFailure",
      state: {
        value: "OK",
        reason: "Threshold not crossed for 1 datapoint",
        timestamp: "2026-08-24T02:37:00.000Z",
      },
      previousState: {
        value: "ALARM",
        reason: "was in alarm",
        timestamp: "2026-08-24T02:30:00.000Z",
      },
    };

    const message = buildSlackMessage(
      detail,
      parseAlarmName(detail.alarmName, PREFIX),
      { successCount: 7, minCount: 5, lookbackMinutes: 5 },
    );

    expect(alarmSection(message).fields).toContainEqual({
      type: "mrkdwn",
      text: "*최근 게임 시작 성공*\n7회 (최근 5분, 기준 5회 이상)",
    });
  });

  it("naming convention을 벗어난 Alarm은 UNKNOWN으로 fallback하되 필수 정보는 유지한다", () => {
    const detail: CloudWatchAlarmStateChangeDetail = {
      alarmName: "SongQuiz-Prod-broken-name",
      state: {
        value: "ALARM",
        reason: "some reason",
        timestamp: "2026-08-24T02:30:00.000Z",
      },
      previousState: {
        value: "OK",
        reason: "ok",
        timestamp: "2026-08-24T02:25:00.000Z",
      },
    };

    const message = buildSlackMessage(
      detail,
      parseAlarmName(detail.alarmName, PREFIX),
    );

    expect(message.text).toBe("🚨 [UNKNOWN] Unknown 알람 발생");
    expect(alarmSection(message).fields).toContainEqual({
      type: "mrkdwn",
      text: "*알람*\nSongQuiz-Prod-broken-name",
    });
  });

  it("reason이 너무 길면 300자로 자른다", () => {
    const longReason = "x".repeat(500);
    const detail: CloudWatchAlarmStateChangeDetail = {
      alarmName: "SongQuiz-Prod-Warning-EC2-HighCPU",
      state: {
        value: "ALARM",
        reason: longReason,
        timestamp: "2026-08-24T02:30:00.000Z",
      },
      previousState: {
        value: "OK",
        reason: "ok",
        timestamp: "2026-08-24T02:25:00.000Z",
      },
    };

    const message = buildSlackMessage(
      detail,
      parseAlarmName(detail.alarmName, PREFIX),
    );
    const reasonText = reasonSection(message).text?.text as string;
    expect(reasonText.length).toBeLessThan(320);
    expect(reasonText).toContain("…");
  });
});
