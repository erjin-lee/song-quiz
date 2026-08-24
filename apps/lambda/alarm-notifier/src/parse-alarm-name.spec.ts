import { parseAlarmName } from "./parse-alarm-name";

const PREFIX = "SongQuiz-Prod-";

describe("parseAlarmName", () => {
  it("severity/service/signal을 추출한다", () => {
    expect(parseAlarmName("SongQuiz-Prod-High-Game-Target5xx", PREFIX)).toEqual(
      {
        severity: "High",
        service: "Game",
        signal: "Target5xx",
      },
    );
  });

  it("signal 자체에 -가 있어도 마지막 값으로 합쳐서 추출한다", () => {
    expect(
      parseAlarmName("SongQuiz-Prod-Warning-EC2-High-CPU", PREFIX),
    ).toEqual({
      severity: "Warning",
      service: "EC2",
      signal: "High-CPU",
    });
  });

  it("prefix가 다르면 null을 반환한다", () => {
    expect(
      parseAlarmName("OtherProject-Prod-High-Game-Target5xx", PREFIX),
    ).toBeNull();
  });

  it("prefix를 뗀 나머지가 3토큰 미만이면 null을 반환한다", () => {
    expect(parseAlarmName("SongQuiz-Prod-High-Game", PREFIX)).toBeNull();
  });
});
