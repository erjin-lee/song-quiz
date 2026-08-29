import fixture from "../test/fixtures/quiz-snapshot-failure-alarm.json";
import gameTarget5xxFixture from "../test/fixtures/game-target-5xx-alarm.json";
import apiTarget5xxFixture from "../test/fixtures/api-target-5xx-alarm.json";
import { EventBridgeAlarmStateChangeEvent } from "./types";

const mockCollectAlarmDefinition = jest.fn();
const mockCollectMetrics = jest.fn();
const mockCollectLogs = jest.fn();
const mockCollectTraces = jest.fn();
const mockCollectDeployments = jest.fn();
const mockAnalyzeIncident = jest.fn();
const mockSendSlackMessage = jest.fn();
const mockGetSsmParameter = jest.fn();

jest.mock("./context/collect-alarm-definition", () => ({
  collectAlarmDefinition: (...args: unknown[]) =>
    mockCollectAlarmDefinition(...args),
}));
jest.mock("./context/collect-metrics", () => ({
  collectMetrics: (...args: unknown[]) => mockCollectMetrics(...args),
}));
jest.mock("./context/collect-logs", () => ({
  collectLogs: (...args: unknown[]) => mockCollectLogs(...args),
}));
jest.mock("./context/collect-traces", () => ({
  collectTraces: (...args: unknown[]) => mockCollectTraces(...args),
}));
jest.mock("./context/collect-deployments", () => ({
  collectDeployments: (...args: unknown[]) => mockCollectDeployments(...args),
}));
jest.mock("./openai/analyze-incident", () => ({
  analyzeIncident: (...args: unknown[]) => mockAnalyzeIncident(...args),
}));
jest.mock("./send-slack-message", () => ({
  sendSlackMessage: (...args: unknown[]) => mockSendSlackMessage(...args),
}));
jest.mock("./get-ssm-parameter", () => ({
  getSsmParameter: (...args: unknown[]) => mockGetSsmParameter(...args),
}));

const alarmEvent = fixture as unknown as EventBridgeAlarmStateChangeEvent;
const gameTarget5xxEvent =
  gameTarget5xxFixture as unknown as EventBridgeAlarmStateChangeEvent;
const apiTarget5xxEvent =
  apiTarget5xxFixture as unknown as EventBridgeAlarmStateChangeEvent;

const ENV = {
  GAME_LOG_GROUP_NAME: "/deploy-terraform/game",
  API_LOG_GROUP_NAME: "/deploy-terraform/api",
  ALB_ARN_SUFFIX: "app/deploy-terraform-alb/abc",
  API_TARGET_GROUP_ARN_SUFFIX: "targetgroup/deploy-terraform-api/def",
  GAME_TARGET_GROUP_ARN_SUFFIX: "targetgroup/deploy-terraform-game/ghi",
  DB_INSTANCE_IDENTIFIER: "deploy-terraform-db",
  EC2_INSTANCE_ID: "i-088da98215dd782e4",
  EC2_METRIC_NAMESPACE: "SongQuiz/EC2",
  CACHE_CLUSTER_ID: "deploy-terraform-cache",
  ECS_CLUSTER_NAME: "song-quiz-cluster",
  ECS_API_SERVICE_NAME: "song-quiz-api",
  API_ECS_TARGET_GROUP_ARN_SUFFIX: "targetgroup/deploy-terraform-app-ecs/jkl",
  SLACK_WEBHOOK_PARAMETER_NAME: "/song-quiz/prod/slack/alarm-webhook-url",
  OPENAI_API_KEY_PARAMETER_NAME: "/song-quiz/prod/openai/api-key",
};

const SUCCESSFUL_ALARM_DEFINITION = { status: "success", definition: {} };
const SUCCESSFUL_METRICS = { status: "success", metrics: [] };
const SUCCESSFUL_LOGS = {
  status: "success",
  logs: { errorCount: 1, eventCounts: [], errorCodeCounts: [], samples: [] },
};
const SUCCESSFUL_TRACES = { status: "success", traces: [] };
const SUCCESSFUL_DEPLOYMENTS = { status: "success", deployments: [] };
const ANALYSIS_RESULT = {
  summary: "s",
  probableCause: "c",
  confidence: "HIGH",
  evidence: ["e"],
  recommendedChecks: ["r"],
  limitations: [],
  deploymentCorrelation: { relevance: "NONE", summary: "관련 없음" },
};

describe("handler", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...originalEnv, ...ENV };

    mockCollectAlarmDefinition.mockResolvedValue(SUCCESSFUL_ALARM_DEFINITION);
    mockCollectMetrics.mockResolvedValue(SUCCESSFUL_METRICS);
    mockCollectLogs.mockResolvedValue(SUCCESSFUL_LOGS);
    mockCollectTraces.mockResolvedValue(SUCCESSFUL_TRACES);
    mockCollectDeployments.mockResolvedValue(SUCCESSFUL_DEPLOYMENTS);
    mockAnalyzeIncident.mockResolvedValue(ANALYSIS_RESULT);
    mockGetSsmParameter.mockResolvedValue("secret-value");
    mockSendSlackMessage.mockResolvedValue(undefined);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("QuizSnapshotFailure ALARM은 context를 모아 OpenAI 분석 후 Slack으로 보낸다", async () => {
    const { handler } = await import("./handler");

    await handler(alarmEvent);

    expect(mockCollectMetrics).toHaveBeenCalledTimes(1);
    expect(mockCollectMetrics).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "QUIZ_SNAPSHOT_FAILURE",
    );
    expect(mockCollectLogs).toHaveBeenCalledTimes(1);
    expect(mockCollectTraces).toHaveBeenCalledTimes(1);
    expect(mockAnalyzeIncident).toHaveBeenCalledTimes(1);
    expect(mockSendSlackMessage).toHaveBeenCalledTimes(1);
  });

  it("Game Target5xx ALARM은 신규 GAME_TARGET_5XX 분석으로 context를 모아 OpenAI 분석 후 Slack으로 보낸다", async () => {
    const { handler } = await import("./handler");

    await handler(gameTarget5xxEvent);

    expect(mockCollectMetrics).toHaveBeenCalledTimes(1);
    expect(mockCollectMetrics).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "GAME_TARGET_5XX",
    );
    expect(mockCollectLogs).toHaveBeenCalledTimes(1);
    expect(mockAnalyzeIncident).toHaveBeenCalledTimes(1);
    expect(mockSendSlackMessage).toHaveBeenCalledTimes(1);
  });

  it("OK 상태는 분석하지 않는다(§6)", async () => {
    const event: EventBridgeAlarmStateChangeEvent = {
      ...alarmEvent,
      detail: {
        ...alarmEvent.detail,
        state: { ...alarmEvent.detail.state, value: "OK" },
      },
    };

    const { handler } = await import("./handler");
    await handler(event);

    expect(mockCollectMetrics).not.toHaveBeenCalled();
    expect(mockAnalyzeIncident).not.toHaveBeenCalled();
    expect(mockSendSlackMessage).not.toHaveBeenCalled();
  });

  it("Game Target5xx의 OK 상태도 분석하지 않는다(§6)", async () => {
    const event: EventBridgeAlarmStateChangeEvent = {
      ...gameTarget5xxEvent,
      detail: {
        ...gameTarget5xxEvent.detail,
        state: { ...gameTarget5xxEvent.detail.state, value: "OK" },
      },
    };

    const { handler } = await import("./handler");
    await handler(event);

    expect(mockCollectMetrics).not.toHaveBeenCalled();
    expect(mockSendSlackMessage).not.toHaveBeenCalled();
  });

  it("API Target5xx ALARM은 신규 API_TARGET_5XX 분석으로 context를 모아 OpenAI 분석 후 Slack으로 보낸다", async () => {
    const { handler } = await import("./handler");

    await handler(apiTarget5xxEvent);

    expect(mockCollectMetrics).toHaveBeenCalledTimes(1);
    expect(mockCollectMetrics).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "API_TARGET_5XX",
    );
    expect(mockCollectLogs).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "API_TARGET_5XX",
    );
    expect(mockAnalyzeIncident).toHaveBeenCalledTimes(1);
    expect(mockSendSlackMessage).toHaveBeenCalledTimes(1);
  });

  it("ECS app_ecs 타겟그룹의 API Target5xx ALARM도 같은 API_TARGET_5XX 분석으로 연결된다(3단계 - api_traffic_target 전환 시점과 무관하게 EC2/ECS 두 타겟그룹 모두 감시)", async () => {
    const event: EventBridgeAlarmStateChangeEvent = {
      ...apiTarget5xxEvent,
      detail: {
        ...apiTarget5xxEvent.detail,
        alarmName: "SongQuiz-Prod-High-API-ECS-Target5xx",
      },
    };

    const { handler } = await import("./handler");
    await handler(event);

    expect(mockCollectMetrics).toHaveBeenCalledTimes(1);
    expect(mockCollectMetrics).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "API_TARGET_5XX",
    );
    expect(mockSendSlackMessage).toHaveBeenCalledTimes(1);
  });

  it("API Target5xx의 OK 상태도 분석하지 않는다(§6)", async () => {
    const event: EventBridgeAlarmStateChangeEvent = {
      ...apiTarget5xxEvent,
      detail: {
        ...apiTarget5xxEvent.detail,
        state: { ...apiTarget5xxEvent.detail.state, value: "OK" },
      },
    };

    const { handler } = await import("./handler");
    await handler(event);

    expect(mockCollectMetrics).not.toHaveBeenCalled();
    expect(mockSendSlackMessage).not.toHaveBeenCalled();
  });

  it("아직 지원하지 않는 Alarm(EC2 HighCPU)은 분석하지 않는다(§5)", async () => {
    const event: EventBridgeAlarmStateChangeEvent = {
      ...alarmEvent,
      detail: {
        ...alarmEvent.detail,
        alarmName: "SongQuiz-Prod-Warning-EC2-HighCPU",
      },
    };

    const { handler } = await import("./handler");
    await handler(event);

    expect(mockCollectMetrics).not.toHaveBeenCalled();
    expect(mockSendSlackMessage).not.toHaveBeenCalled();
  });

  it("API_LOG_GROUP_NAME이 없어도 QuizSnapshotFailure/Game Target5xx는 계속 동작한다(§AIOps v1-3 - 배포 순서 분리)", async () => {
    process.env.API_LOG_GROUP_NAME = "";

    const { handler } = await import("./handler");
    await handler(alarmEvent);
    await handler(gameTarget5xxEvent);

    expect(mockCollectMetrics).toHaveBeenCalledTimes(2);
    expect(mockSendSlackMessage).toHaveBeenCalledTimes(2);
  });

  it("API_LOG_GROUP_NAME이 없으면 API Target5xx만 조용히 종료한다", async () => {
    process.env.API_LOG_GROUP_NAME = "";

    const { handler } = await import("./handler");
    await handler(apiTarget5xxEvent);

    expect(mockCollectMetrics).not.toHaveBeenCalled();
    expect(mockSendSlackMessage).not.toHaveBeenCalled();
  });

  it("API_ECS_TARGET_GROUP_ARN_SUFFIX가 없으면 API Target5xx만 조용히 종료한다(3단계)", async () => {
    process.env.API_ECS_TARGET_GROUP_ARN_SUFFIX = "";

    const { handler } = await import("./handler");
    await handler(apiTarget5xxEvent);

    expect(mockCollectMetrics).not.toHaveBeenCalled();
    expect(mockSendSlackMessage).not.toHaveBeenCalled();
  });

  it("ECS_CLUSTER_NAME/ECS_API_SERVICE_NAME이 없으면 API Target5xx만 조용히 종료한다(3단계 - terraform apply 전에 CI가 코드를 먼저 배포할 수 있다)", async () => {
    process.env.ECS_CLUSTER_NAME = "";
    process.env.ECS_API_SERVICE_NAME = "";

    const { handler } = await import("./handler");
    await handler(apiTarget5xxEvent);

    expect(mockCollectMetrics).not.toHaveBeenCalled();
    expect(mockSendSlackMessage).not.toHaveBeenCalled();
  });

  it("ECS_CLUSTER_NAME/ECS_API_SERVICE_NAME이 없어도 QuizSnapshotFailure/Game Target5xx는 계속 동작한다(3단계 - API_TARGET_5XX 전용 requiredEnv)", async () => {
    process.env.ECS_CLUSTER_NAME = "";
    process.env.ECS_API_SERVICE_NAME = "";

    const { handler } = await import("./handler");
    await handler(alarmEvent);
    await handler(gameTarget5xxEvent);

    expect(mockCollectMetrics).toHaveBeenCalledTimes(2);
    expect(mockSendSlackMessage).toHaveBeenCalledTimes(2);
  });

  it("Metrics/Logs가 모두 실패하면 OpenAI를 호출하지 않는다(§16)", async () => {
    mockCollectMetrics.mockResolvedValueOnce({ status: "failed", metrics: [] });
    mockCollectLogs.mockResolvedValueOnce({
      status: "failed",
      logs: {
        errorCount: 0,
        eventCounts: [],
        errorCodeCounts: [],
        samples: [],
      },
    });

    const { handler } = await import("./handler");
    await handler(alarmEvent);

    expect(mockAnalyzeIncident).not.toHaveBeenCalled();
    expect(mockSendSlackMessage).not.toHaveBeenCalled();
  });

  it("일부 collector(Trace) 실패해도 남은 데이터로 분석을 계속한다(§16)", async () => {
    mockCollectTraces.mockResolvedValueOnce({ status: "failed", traces: [] });

    const { handler } = await import("./handler");
    await handler(alarmEvent);

    expect(mockAnalyzeIncident).toHaveBeenCalledTimes(1);
    expect(mockSendSlackMessage).toHaveBeenCalledTimes(1);
  });

  it("Deployment 조회가 실패해도 남은 데이터로 분석을 계속한다(§29)", async () => {
    mockCollectDeployments.mockResolvedValueOnce({
      status: "failed",
      deployments: [],
    });

    const { handler } = await import("./handler");
    await handler(alarmEvent);

    expect(mockAnalyzeIncident).toHaveBeenCalledTimes(1);
    expect(mockSendSlackMessage).toHaveBeenCalledTimes(1);
  });

  it("Deployment Context를 Slack 메시지 빌더에 그대로 전달한다", async () => {
    mockCollectDeployments.mockResolvedValueOnce({
      status: "success",
      deployments: [
        {
          service: "api",
          commitSha: "abc123",
          deployedAt: "2026-08-24T03:21:00.000Z",
          minutesBeforeIncident: 9,
          pullRequest: {
            number: 82,
            title: "Quiz Snapshot 조회 로직 개선",
            changedFiles: [],
          },
        },
      ],
    });
    mockAnalyzeIncident.mockResolvedValueOnce({
      ...ANALYSIS_RESULT,
      deploymentCorrelation: {
        relevance: "HIGH",
        summary: "연관성이 높습니다.",
      },
    });

    const { handler } = await import("./handler");
    await handler(alarmEvent);

    const [, message] = mockSendSlackMessage.mock.calls[0];
    expect(JSON.stringify(message)).toContain("PR #82");
  });

  it("OpenAI 호출이 실패해도 예외를 던지지 않고 Slack을 호출하지 않는다(기존 notifier에는 영향 없음, §2)", async () => {
    mockAnalyzeIncident.mockRejectedValueOnce(new Error("openai down"));

    const { handler } = await import("./handler");

    await expect(handler(alarmEvent)).resolves.toBeUndefined();
    expect(mockSendSlackMessage).not.toHaveBeenCalled();
  });

  it("필수 환경변수가 비어있으면 AWS API를 호출하지 않고 조용히 종료한다", async () => {
    process.env.GAME_LOG_GROUP_NAME = "";

    const { handler } = await import("./handler");
    await handler(alarmEvent);

    expect(mockCollectMetrics).not.toHaveBeenCalled();
  });
});
