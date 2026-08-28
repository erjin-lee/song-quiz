export {};

const sendMock = jest.fn();

jest.mock("@aws-sdk/client-cost-explorer", () => ({
  CostExplorerClient: jest.fn().mockImplementation(() => ({ send: sendMock })),
  GetCostAndUsageCommand: jest.fn().mockImplementation((input) => ({ input })),
  GetCostForecastCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

describe("fetchDailyCosts", () => {
  beforeEach(() => {
    sendMock.mockReset();
    jest.resetModules();
  });

  it("ResultsByTime을 날짜/UnblendedCost 금액 배열로 변환한다", async () => {
    sendMock.mockResolvedValueOnce({
      ResultsByTime: [
        {
          TimePeriod: { Start: "2026-08-27", End: "2026-08-28" },
          Total: { UnblendedCost: { Amount: "2.14", Unit: "USD" } },
        },
        {
          TimePeriod: { Start: "2026-08-28", End: "2026-08-29" },
          Total: { UnblendedCost: { Amount: "0", Unit: "USD" } },
        },
      ],
    });

    const { fetchDailyCosts } = await import("./fetch-daily-costs");
    const result = await fetchDailyCosts("2026-08-01", "2026-08-29");

    expect(result).toEqual([
      { date: "2026-08-27", amountUsd: 2.14 },
      { date: "2026-08-28", amountUsd: 0 },
    ]);
  });

  it("ResultsByTime이 비어있으면 빈 배열을 반환한다", async () => {
    sendMock.mockResolvedValueOnce({});

    const { fetchDailyCosts } = await import("./fetch-daily-costs");
    expect(await fetchDailyCosts("2026-08-01", "2026-08-29")).toEqual([]);
  });
});
