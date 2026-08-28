export {};

const sendMock = jest.fn();

jest.mock("@aws-sdk/client-cost-explorer", () => ({
  CostExplorerClient: jest.fn().mockImplementation(() => ({ send: sendMock })),
  GetCostForecastCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

describe("fetchForecastRemainderUsd", () => {
  beforeEach(() => {
    sendMock.mockReset();
    jest.resetModules();
  });

  it("Total.Amount를 숫자로 변환한다", async () => {
    sendMock.mockResolvedValueOnce({ Total: { Amount: "16.48", Unit: "USD" } });

    const { fetchForecastRemainderUsd } = await import("./fetch-forecast");
    expect(await fetchForecastRemainderUsd("2026-08-28", "2026-09-01")).toBe(
      16.48,
    );
  });

  it("Total이 없으면 0을 반환한다", async () => {
    sendMock.mockResolvedValueOnce({});

    const { fetchForecastRemainderUsd } = await import("./fetch-forecast");
    expect(await fetchForecastRemainderUsd("2026-08-28", "2026-09-01")).toBe(0);
  });
});
