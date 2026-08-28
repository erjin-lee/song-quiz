export {};

const sendMock = jest.fn();

jest.mock("@aws-sdk/client-cost-explorer", () => ({
  CostExplorerClient: jest.fn().mockImplementation(() => ({ send: sendMock })),
  GetCostAndUsageCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

describe("fetchServiceCosts", () => {
  beforeEach(() => {
    sendMock.mockReset();
    jest.resetModules();
  });

  it("Groups를 서비스명/금액 배열로 변환한다", async () => {
    sendMock.mockResolvedValueOnce({
      ResultsByTime: [
        {
          Groups: [
            {
              Keys: ["Amazon EC2"],
              Metrics: { UnblendedCost: { Amount: "0.82", Unit: "USD" } },
            },
            {
              Keys: ["Amazon RDS"],
              Metrics: { UnblendedCost: { Amount: "0.54", Unit: "USD" } },
            },
          ],
        },
      ],
    });

    const { fetchServiceCosts } = await import("./fetch-service-costs");
    const result = await fetchServiceCosts("2026-08-27", "2026-08-28");

    expect(result).toEqual([
      { service: "Amazon EC2", amountUsd: 0.82 },
      { service: "Amazon RDS", amountUsd: 0.54 },
    ]);
  });

  it("Groups가 없으면 빈 배열을 반환한다", async () => {
    sendMock.mockResolvedValueOnce({ ResultsByTime: [{}] });

    const { fetchServiceCosts } = await import("./fetch-service-costs");
    expect(await fetchServiceCosts("2026-08-27", "2026-08-28")).toEqual([]);
  });
});
