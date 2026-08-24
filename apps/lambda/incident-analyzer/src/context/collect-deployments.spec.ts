const mockGetSsmParameter = jest.fn();

jest.mock("../get-ssm-parameter", () => ({
  getSsmParameter: (...args: unknown[]) => mockGetSsmParameter(...args),
}));

import { collectDeployments } from "./collect-deployments";

const CONFIG = {
  apiDeploymentParameterName: "/song-quiz/prod/deployment/api",
  gameDeploymentParameterName: "/song-quiz/prod/deployment/game",
};

const INCIDENT_AT = new Date("2026-08-24T02:30:00.000Z");

function parameterNotFoundError(): Error {
  const error = new Error("not found");
  error.name = "ParameterNotFound";
  return error;
}

describe("collectDeployments", () => {
  beforeEach(() => {
    mockGetSsmParameter.mockReset();
  });

  it("API/Game 배포 metadata를 파싱하고 minutesBeforeIncident를 계산한다(§19~20)", async () => {
    mockGetSsmParameter.mockImplementation(async (name: string) => {
      if (name === CONFIG.apiDeploymentParameterName) {
        return JSON.stringify({
          commitSha: "abc123",
          deployedAt: "2026-08-24T02:21:00.000Z", // 9분 전
          pullRequest: {
            number: 82,
            title: "Quiz Snapshot 조회 로직 개선",
            changedFiles: ["a.ts"],
          },
        });
      }
      return JSON.stringify({
        commitSha: "def456",
        deployedAt: "2026-08-24T02:00:00.000Z",
      });
    });

    const result = await collectDeployments(CONFIG, INCIDENT_AT);

    expect(result.status).toBe("success");
    const api = result.deployments.find((d) => d.service === "api");
    expect(api?.minutesBeforeIncident).toBe(9);
    expect(api?.pullRequestLookup).toBe("FOUND");
    expect(api?.pullRequest).toEqual({
      number: 82,
      title: "Quiz Snapshot 조회 로직 개선",
      summary: undefined,
      changedFiles: ["a.ts"],
    });

    const game = result.deployments.find((d) => d.service === "game");
    expect(game?.pullRequestLookup).toBe("NOT_FOUND"); // direct push(§15)
    expect(game?.pullRequest).toBeUndefined();
  });

  it("pullRequestLookup을 SSM 값 그대로 신뢰한다(FAILED - PR 조회 자체가 실패한 경우, §4)", async () => {
    mockGetSsmParameter.mockResolvedValue(
      JSON.stringify({
        commitSha: "abc123",
        deployedAt: "2026-08-24T02:21:00.000Z",
        pullRequestLookup: "FAILED",
        pullRequest: null,
      }),
    );

    const result = await collectDeployments(
      { apiDeploymentParameterName: CONFIG.apiDeploymentParameterName },
      INCIDENT_AT,
    );

    expect(result.deployments[0].pullRequestLookup).toBe("FAILED");
    expect(result.deployments[0].pullRequest).toBeUndefined();
  });

  it("Alarm 이후에 배포된 경우 minutesBeforeIncident가 음수다(§20)", async () => {
    mockGetSsmParameter.mockResolvedValue(
      JSON.stringify({
        commitSha: "abc123",
        deployedAt: "2026-08-24T02:40:00.000Z",
      }),
    );

    const result = await collectDeployments(
      { apiDeploymentParameterName: CONFIG.apiDeploymentParameterName },
      INCIDENT_AT,
    );

    expect(result.deployments[0].minutesBeforeIncident).toBe(-10);
  });

  it("SSM Parameter가 아직 없으면(ParameterNotFound) 조용히 건너뛰고 success를 유지한다(§29)", async () => {
    mockGetSsmParameter.mockRejectedValue(parameterNotFoundError());

    const result = await collectDeployments(CONFIG, INCIDENT_AT);

    expect(result).toEqual({ status: "success", deployments: [] });
  });

  it("손상된 JSON은 배포 정보 없음으로 취급한다(전체 실패로 보지 않음)", async () => {
    mockGetSsmParameter.mockResolvedValue("not json");

    const result = await collectDeployments(CONFIG, INCIDENT_AT);

    expect(result).toEqual({ status: "success", deployments: [] });
  });

  it("예상치 못한 오류(AccessDenied 등)는 failed 상태로 표시한다", async () => {
    mockGetSsmParameter.mockRejectedValue(new Error("AccessDenied"));

    const result = await collectDeployments(CONFIG, INCIDENT_AT);

    expect(result.status).toBe("failed");
    expect(result.deployments).toEqual([]);
  });

  it("parameter 이름이 설정되지 않으면 조회 자체를 시도하지 않는다", async () => {
    const result = await collectDeployments({}, INCIDENT_AT);

    expect(result).toEqual({ status: "success", deployments: [] });
    expect(mockGetSsmParameter).not.toHaveBeenCalled();
  });

  it("summary/changedFiles를 방어적으로 제한한다(§16, §33)", async () => {
    const longSummary = "a".repeat(2000);
    const manyFiles = Array.from({ length: 50 }, (_, i) => `file-${i}.ts`);
    mockGetSsmParameter.mockResolvedValue(
      JSON.stringify({
        commitSha: "abc123",
        deployedAt: "2026-08-24T02:21:00.000Z",
        pullRequest: {
          number: 1,
          title: "t",
          summary: longSummary,
          changedFiles: manyFiles,
        },
      }),
    );

    const result = await collectDeployments(
      { apiDeploymentParameterName: CONFIG.apiDeploymentParameterName },
      INCIDENT_AT,
    );

    expect(
      result.deployments[0].pullRequest?.summary?.length,
    ).toBeLessThanOrEqual(1000);
    expect(
      result.deployments[0].pullRequest?.changedFiles.length,
    ).toBeLessThanOrEqual(30);
  });
});
