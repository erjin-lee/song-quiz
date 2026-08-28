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

  it("ResultsByTime을 날짜별 RECORD_TYPE 금액 배열로 변환한다", async () => {
    sendMock.mockResolvedValueOnce({
      ResultsByTime: [
        {
          TimePeriod: { Start: "2026-08-27", End: "2026-08-28" },
          Groups: [
            {
              Keys: ["Usage"],
              Metrics: { UnblendedCost: { Amount: "10.22", Unit: "USD" } },
            },
            {
              Keys: ["Credit"],
              Metrics: { UnblendedCost: { Amount: "-10.22", Unit: "USD" } },
            },
          ],
        },
        {
          TimePeriod: { Start: "2026-08-28", End: "2026-08-29" },
          Groups: [],
        },
      ],
    });

    const { fetchDailyCosts } = await import("./fetch-daily-costs");
    const result = await fetchDailyCosts("2026-08-01", "2026-08-29");

    expect(result).toEqual([
      {
        date: "2026-08-27",
        recordTypeAmounts: [
          { recordType: "Usage", amountUsd: 10.22 },
          { recordType: "Credit", amountUsd: -10.22 },
        ],
      },
      { date: "2026-08-28", recordTypeAmounts: [] },
    ]);
  });

  it("ResultsByTime이 비어있으면 빈 배열을 반환한다", async () => {
    sendMock.mockResolvedValueOnce({});

    const { fetchDailyCosts } = await import("./fetch-daily-costs");
    expect(await fetchDailyCosts("2026-08-01", "2026-08-29")).toEqual([]);
  });

  it("NextPageToken이 있으면 없어질 때까지 반복 호출해 모든 페이지를 합친다", async () => {
    sendMock
      .mockResolvedValueOnce({
        ResultsByTime: [
          {
            TimePeriod: { Start: "2026-08-01", End: "2026-08-02" },
            Groups: [
              {
                Keys: ["Usage"],
                Metrics: { UnblendedCost: { Amount: "1", Unit: "USD" } },
              },
            ],
          },
        ],
        NextPageToken: "page-2",
      })
      .mockResolvedValueOnce({
        ResultsByTime: [
          {
            TimePeriod: { Start: "2026-08-02", End: "2026-08-03" },
            Groups: [
              {
                Keys: ["Usage"],
                Metrics: { UnblendedCost: { Amount: "2", Unit: "USD" } },
              },
            ],
          },
        ],
      });

    const { fetchDailyCosts } = await import("./fetch-daily-costs");
    const result = await fetchDailyCosts("2026-08-01", "2026-08-03");

    expect(sendMock).toHaveBeenCalledTimes(2);
    // 두 번째 호출은 첫 페이지가 돌려준 NextPageToken을 그대로 넘겨야 한다.
    expect(sendMock.mock.calls[1][0].input.NextPageToken).toBe("page-2");
    expect(result).toEqual([
      {
        date: "2026-08-01",
        recordTypeAmounts: [{ recordType: "Usage", amountUsd: 1 }],
      },
      {
        date: "2026-08-02",
        recordTypeAmounts: [{ recordType: "Usage", amountUsd: 2 }],
      },
    ]);
  });

  it("같은 날짜의 그룹이 페이지 경계에서 나뉘어도(동일 date가 여러 페이지에 등장) 누락 없이 합산한다", async () => {
    sendMock
      .mockResolvedValueOnce({
        ResultsByTime: [
          {
            TimePeriod: { Start: "2026-08-27", End: "2026-08-28" },
            Groups: [
              {
                Keys: ["Usage"],
                Metrics: { UnblendedCost: { Amount: "10.22", Unit: "USD" } },
              },
            ],
          },
        ],
        NextPageToken: "page-2",
      })
      .mockResolvedValueOnce({
        ResultsByTime: [
          {
            // 같은 날짜(2026-08-27)의 나머지 RECORD_TYPE 그룹이 다음 페이지에 들어있는 경우.
            TimePeriod: { Start: "2026-08-27", End: "2026-08-28" },
            Groups: [
              {
                Keys: ["Credit"],
                Metrics: { UnblendedCost: { Amount: "-10.22", Unit: "USD" } },
              },
            ],
          },
        ],
      });

    const { fetchDailyCosts } = await import("./fetch-daily-costs");
    const result = await fetchDailyCosts("2026-08-27", "2026-08-28");

    expect(result).toEqual([
      {
        date: "2026-08-27",
        recordTypeAmounts: [
          { recordType: "Usage", amountUsd: 10.22 },
          { recordType: "Credit", amountUsd: -10.22 },
        ],
      },
    ]);
  });
});
