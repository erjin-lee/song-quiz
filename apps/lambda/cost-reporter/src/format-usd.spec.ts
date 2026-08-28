import { formatUsd } from "./format-usd";

describe("formatUsd", () => {
  it("소수점 둘째 자리까지 반올림하고 $ 기호를 붙인다", () => {
    expect(formatUsd(2.1)).toBe("$2.10");
    expect(formatUsd(2.145)).toBe("$2.15");
  });

  it("0은 $0.00으로 표시한다", () => {
    expect(formatUsd(0)).toBe("$0.00");
  });

  it("1,000 이상은 천 단위 구분 기호를 붙인다", () => {
    expect(formatUsd(1234.5)).toBe("$1,234.50");
  });
});
