import { buildTopServices } from "./build-top-services";

describe("buildTopServices", () => {
  it("비용 내림차순으로 정렬해 Top N만 반환하고 나머지는 기타로 합산한다", () => {
    const result = buildTopServices(
      [
        { service: "Amazon EC2", amountUsd: 0.82 },
        { service: "Amazon RDS", amountUsd: 0.54 },
        { service: "ElastiCache", amountUsd: 0.31 },
        { service: "CloudWatch", amountUsd: 0.19 },
        { service: "AWS Lambda", amountUsd: 0.1 },
        { service: "SNS", amountUsd: 0.02 },
      ],
      4,
    );

    expect(result.top.map((entry) => entry.service)).toEqual([
      "Amazon EC2",
      "Amazon RDS",
      "ElastiCache",
      "CloudWatch",
    ]);
    expect(result.otherUsd).toBeCloseTo(0.12);
  });

  it("항목이 topN 이하이면 기타는 0이다", () => {
    const result = buildTopServices(
      [{ service: "Amazon EC2", amountUsd: 0.82 }],
      5,
    );

    expect(result.top).toHaveLength(1);
    expect(result.otherUsd).toBe(0);
  });

  it("항목이 없으면 빈 배열과 기타 0을 반환한다", () => {
    const result = buildTopServices([], 5);

    expect(result.top).toEqual([]);
    expect(result.otherUsd).toBe(0);
  });

  it("top + otherUsd 합은 항상 전체 entries 합과 같다", () => {
    const entries = [
      { service: "A", amountUsd: 0 },
      { service: "B", amountUsd: 5 },
      { service: "C", amountUsd: 0.01 },
    ];
    const result = buildTopServices(entries, 1);

    const total = entries.reduce((sum, e) => sum + e.amountUsd, 0);
    const reconstructed =
      result.top.reduce((sum, e) => sum + e.amountUsd, 0) + result.otherUsd;

    expect(reconstructed).toBeCloseTo(total);
  });
});
