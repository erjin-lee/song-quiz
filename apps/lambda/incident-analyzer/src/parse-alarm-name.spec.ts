import { parseAlarmName } from "./parse-alarm-name";

const PREFIX = "SongQuiz-Prod-";

describe("parseAlarmName", () => {
  it("severity/service/signal을 추출한다", () => {
    expect(
      parseAlarmName("SongQuiz-Prod-High-Game-QuizSnapshotFailure", PREFIX),
    ).toEqual({
      severity: "High",
      service: "Game",
      signal: "QuizSnapshotFailure",
    });
  });

  it("prefix가 다르면 null을 반환한다", () => {
    expect(
      parseAlarmName("OtherProject-Prod-High-Game-QuizSnapshotFailure", PREFIX),
    ).toBeNull();
  });

  it("prefix를 뗀 나머지가 3토큰 미만이면 null을 반환한다", () => {
    expect(parseAlarmName("SongQuiz-Prod-High-Game", PREFIX)).toBeNull();
  });
});
